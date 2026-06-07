# Backend Package Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Hono backend toward a standalone workspace package without carrying Next.js runtime dependencies into the backend runtime.

**Architecture:** Extract app-wide shared types, schemas, and pure utilities into `@arc/shared` first. Then move Hono-owned runtime code into `@arc/ai-recruitment-copilot-backend`, keeping Next-specific adapters in the Next app boundary. The Next app continues to mount the Hono app through `src/app/api/[[...route]]/route.ts`.

**Tech Stack:** pnpm workspace, TypeScript, Vitest, Next.js App Router, Hono, Better Auth, Drizzle, Turborepo.

---

### Task 1: Extract `@arc/shared`

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Move: `apps/ai-recruitment-copilot/src/lib/shared/**` to `packages/shared/src/**`
- Modify: imports from `@/lib/shared/*` to `@arc/shared/*`
- Modify: `apps/ai-recruitment-copilot/package.json`
- Modify: `apps/ai-recruitment-copilot/next.config.ts`

- [ ] Run the existing shared tests as a red check against the missing package entry point:

```bash
pnpm --filter @arc/shared test
```

Expected before package creation: package not found.

- [ ] Create `@arc/shared` with exports for `./*` and dependencies required by the moved files.

- [ ] Move shared files and update internal shared imports to package imports.

- [ ] Update all web app imports from `@/lib/shared/*` to `@arc/shared/*`.

- [ ] Verify:

```bash
pnpm --filter @arc/shared test
pnpm --filter @arc/shared typecheck
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm --filter @arc/ai-recruitment-copilot test
```

### Task 2: Extract `@arc/ai-recruitment-copilot-backend`

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/package.json`
- Create: `apps/ai-recruitment-copilot-backend/tsconfig.json`
- Create: `apps/ai-recruitment-copilot-backend/vitest.config.ts`
- Move: `apps/ai-recruitment-copilot/src/server/**` to `apps/ai-recruitment-copilot-backend/src/server/**`
- Move or split: Hono-used `apps/ai-recruitment-copilot/src/lib/server/**` modules into `apps/ai-recruitment-copilot-backend/src/lib/server/**`
- Keep in app: Next route handlers and Next-only adapters.
- Modify: `apps/ai-recruitment-copilot/src/app/api/[[...route]]/route.ts`
- Modify: `apps/ai-recruitment-copilot/src/lib/client/rpc.ts`
- Modify: imports from `@/server/*` to `@arc/ai-recruitment-copilot-backend/server/*`

- [ ] Add a backend boundary test that fails if `apps/ai-recruitment-copilot-backend/src/**` imports `next/*`, `server-only`, `client-only`, or `@/`.

- [ ] Move Hono code and backend-owned server utilities into `@arc/ai-recruitment-copilot-backend`.

- [ ] Update the Next app to import the backend app factory and keep Next runtime integration in app-only adapter files.

- [ ] Verify:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm --filter @arc/ai-recruitment-copilot test
pnpm --filter @arc/ai-recruitment-copilot build
```

### Task 3: Final Verification

**Files:**

- Modify only files directly required by Task 1 and Task 2.

- [ ] Run root checks:

```bash
pnpm check
pnpm typecheck
pnpm test
git diff --check
```

- [ ] Dispatch a final subagent code review focused on runtime boundaries, package dependencies, and accidental Next coupling.

- [ ] Commit locally. Do not push.
