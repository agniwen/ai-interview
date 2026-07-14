# Upstream Mastra Studio

This feature vendors the Apache-2.0 Studio source from
[`mastra-ai/mastra`](https://github.com/mastra-ai/mastra), tag `mastra@1.18.2`,
commit `0223aa21b6f5f86dc9e669968669c78f3972693c`, package
`packages/playground`.

The Enterprise Edition source under upstream `src/ee/` is intentionally not
vendored. Its production use requires a separate agreement with Mastra. The
corresponding Signals routes and navigation entry are disabled in this app.

ARC-specific integration changes live alongside the vendored source. When
updating from upstream, compare `packages/playground` with `upstream/`, preserve
the TanStack Router adapters, Platform layout and permission boundary, scoped
theme and styles, and `/api/platform/mastra` transport configuration. Do not
import directories named `ee/`.

The main ARC-owned deltas are:

- React Router calls are routed through the TanStack Router compatibility layer;
- route declarations live under the host application's `src/routes/` tree;
- the upstream main sidebar and theme selector are replaced by Platform UI;
- Studio follows the host theme, and its connection settings are host-managed and read-only;
- HTTP and WebSocket traffic uses the host's `/api/platform/mastra` endpoint;
- browser-only layout, scoped portal/CSS, and strict TypeScript compatibility changes.
