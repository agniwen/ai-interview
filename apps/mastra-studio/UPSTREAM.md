# Upstream Mastra Studio

This application vendors the Apache-2.0 Studio source from
[`mastra-ai/mastra`](https://github.com/mastra-ai/mastra), tag `mastra@1.18.2`,
commit `0223aa21b6f5f86dc9e669968669c78f3972693c`, package
`packages/playground`.

The Enterprise Edition source under upstream `src/ee/` is intentionally not
vendored. Its production use requires a separate agreement with Mastra. The
corresponding Signals routes and navigation entry are disabled in this app.

ARC-specific integration changes belong directly in this application. When
updating from upstream, compare `packages/playground`, preserve the integration
settings in `vite.config.ts`, and do not import directories named `ee/`.

The current ARC-owned deltas are deliberately small:

- standalone Vite HTML substitution and browser-only build stubs in `vite.config.ts`;
- `/api/platform/mastra` and `/internal/mastra-studio` defaults in `package.json`;
- removal of Enterprise Signals imports, routes, navigation, and permissions;
- replacement of the upstream workspace-only `zod-v4` alias with `zod/v4`.
