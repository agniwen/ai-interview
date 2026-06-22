# Job Description Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional, workspace-scoped, server-generated codes for active job descriptions, with a visible form control that lets users generate a code before saving.

**Architecture:** Store nullable `job_description.code` and per-workspace `global_config.job_code_prefix`. Generate codes from the backend so the timestamp and workspace prefix stay authoritative, enforce uniqueness with a partial workspace-scoped unique index, expose a form `InputGroup` with a generate action, and keep create-time generation as a server-side fallback when the field is empty.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, PostgreSQL, Zod, React 19, TanStack Router/Query/Form, Vitest.

---

## File Structure

- Modify `packages/db-schema/src/schema.ts` for Drizzle columns and indexes.
- Add a Drizzle SQL migration under `apps/ai-recruitment-copilot/drizzle/`.
- Modify `packages/shared/src/global-config.ts` for prefix validation and DTO shape.
- Modify `packages/shared/src/job-descriptions.ts` for nullable `code` on records only.
- Modify `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/global-config/dao.ts` to serialize and persist the prefix.
- Add `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/job-description-code.ts` for generation helpers.
- Add `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/job-description-code.test.ts`.
- Modify `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/route.ts` to generate and retry codes on create.
- Modify `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/dao.ts` to return `code`.
- Modify `apps/ai-recruitment-copilot/src/components/features/studio/global-config/global-config-form.tsx` for the prefix input.
- Modify `apps/ai-recruitment-copilot/src/components/features/studio/job-descriptions/job-description-form-dialog.tsx` for read-only edit display.
- Modify `apps/ai-recruitment-copilot/src/routes/w.$slug.studio.job-descriptions.tsx` for the list column.

## Tasks

### Task 1: Shared Schema and Code Helper

**Files:**

- Modify: `packages/shared/src/global-config.ts`
- Modify: `packages/shared/src/job-descriptions.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/job-description-code.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/job-description-code.test.ts`

- [x] Write failing tests for prefix normalization and code format.
- [x] Run `pnpm --filter @arc/ai-recruitment-copilot-backend test src/server/routes/studio/routes/job-descriptions/utils/job-description-code.test.ts`.
- [x] Add `normalizeJobCodePrefix`, `formatJobCodeTimestamp`, and `generateJobDescriptionCode`.
- [x] Extend shared DTOs with `jobCodePrefix` and `code`.
- [x] Re-run the focused backend test.

### Task 2: Database Schema and Global Config Persistence

**Files:**

- Modify: `packages/db-schema/src/schema.ts`
- Add: `apps/ai-recruitment-copilot/drizzle/20260622120000_add_job_description_code/migration.sql`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/global-config/dao.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/global-config/__tests__/route.test.ts`

- [x] Update global-config route tests to expect `jobCodePrefix`.
- [x] Run the focused global-config test and verify it fails.
- [x] Add Drizzle columns and partial unique index.
- [x] Add SQL migration with nullable `job_description.code` and non-null defaulted `global_config.job_code_prefix`.
- [x] Serialize, lazily create, and upsert `jobCodePrefix`.
- [x] Re-run the focused global-config test.

### Task 3: Job Description Create Flow

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/route.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/dao.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/job-description-code.test.ts`

- [x] Add tests for deterministic retry helper behavior.
- [x] Run focused tests and verify the new expectation fails.
- [x] Generate `code` during create with up to 10 attempts.
- [x] Preserve existing `code` during update, allow filling a legacy null code, and return it in list/detail serializers.
- [x] Re-run focused backend tests.

### Task 4: Studio UI

**Files:**

- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/global-config/global-config-form.tsx`
- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/job-descriptions/job-description-form-dialog.tsx`
- Modify: `apps/ai-recruitment-copilot/src/routes/w.$slug.studio.job-descriptions.tsx`

- [x] Add the system-settings prefix input using existing form style.
- [x] Add a visible `岗位编码` `InputGroup` with a right-side `生成` button in the basic form.
- [x] Add a `/generate-code` API used by the form button.
- [x] Add a `编码` column in the job-description data grid.
- [x] Keep `code` optional so legacy rows can remain null.

### Task 5: Verification

**Files:**

- All touched files.

- [x] Run `pnpm check`.
- [x] Run `pnpm --filter @arc/ai-recruitment-copilot-backend test src/server/routes/studio/routes/job-descriptions/utils/job-description-code.test.ts`.
- [x] Run `pnpm --filter @arc/ai-recruitment-copilot-backend test src/server/routes/studio/routes/global-config/__tests__/route.test.ts`.
- [x] Run `pnpm --filter @arc/ai-recruitment-copilot-backend test src/server/routes/interview/__tests__/match-job-description.test.ts`.
- [x] Run `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck`.
- [x] Run `pnpm --filter @arc/ai-recruitment-copilot typecheck`.
