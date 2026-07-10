# Web app tests

## Layout

| Location                             | What belongs here                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `src/__tests__/architecture/`        | Cross-cutting invariants (no Next leftovers, route tree, Start wiring, cookie credentials). Prefer few, high-signal checks. |
| `src/__tests__/server-entry.test.ts` | TanStack Start server entry / Hono mount behavior                                                                           |
| `src/**/__tests__/`                  | Colocated unit tests for the parent module (pure logic, hooks, components)                                                  |
| `src/env/__tests__/`                 | Env schema / Docker env wiring                                                                                              |
| `src/lib/**/__tests__/`              | Client/start helpers                                                                                                        |

**Do not put tests under `src/routes/`.** Route files are page entries for TanStack Router. The Vite plugin also ignores `__tests__`, `__test__`, `*.test.*`, and `*.spec.*` via `routeFileIgnorePattern` as a safety net.

## What we keep

- Runtime / pure-function tests that import and execute code
- A small architecture suite that freezes product/security boundaries

## What we do not add

- Source-scan freezes of Tailwind class names, section order, or motion curves
- One-off “migration complete” tests that only assert a string exists in a giant page file

## Running

```bash
pnpm --filter @arc/ai-recruitment-copilot test
```
