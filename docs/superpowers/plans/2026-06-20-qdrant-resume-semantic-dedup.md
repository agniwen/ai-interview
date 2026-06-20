# Qdrant Resume Semantic Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Qdrant-backed semantic resume index that improves duplicate detection and creates the foundation for future resume recommendation.

**Architecture:** PostgreSQL remains the source of truth for resumes and permissions. Qdrant stores three vectors per parsed resume and minimal payload. A BullMQ worker asynchronously indexes ready resumes, while existing dedup endpoints return richer semantic match records. Qdrant or embedding failures return no duplicate matches instead of falling back to identity dedup.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, PostgreSQL, BullMQ, Qdrant HTTP API, DashScope `text-embedding-v4` via OpenAI-compatible embeddings API, Vitest.

---

### Task 1: Documentation And Database State

**Files:**

- Create: `docs/superpowers/specs/2026-06-20-qdrant-resume-semantic-dedup-design.md`
- Create: `docs/superpowers/plans/2026-06-20-qdrant-resume-semantic-dedup.md`
- Modify: `packages/db-schema/src/schema.ts`
- Create: `apps/ai-recruitment-copilot/drizzle/20260620090000_resume_semantic_index/migration.sql`

- [x] Add `resume_semantic_index` and `resume_duplicate_match` tables.
- [x] Add indexes for organization/source/version/status lookups.
- [x] Run `pnpm --filter @arc/db-schema typecheck`.

### Task 2: Resume Semantic Text Builders

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/text-builders.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/profile-hash.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/text-builders.test.ts`

- [x] Write tests for stable profile hashing, placeholder filtering, and the three text chunks.
- [x] Run the focused test and verify it fails before implementation.
- [x] Implement normalized text builders and profile hash.
- [x] Run the focused test and verify it passes.

### Task 3: DashScope Embedding And Qdrant Store

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/embedding.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/vector-store.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/lib/server/qdrant/resume-vector-store.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/qdrant-store.test.ts`

- [x] Write tests with a fake Qdrant SDK client for collection creation, upsert, search, and delete.
- [x] Run the focused test and verify it fails.
- [x] Implement Qdrant through the official `@qdrant/js-client-rest` SDK.
- [x] Implement DashScope embeddings through OpenAI-compatible HTTP.
- [x] Run focused tests.

### Task 4: Semantic Index Queue And Worker

**Files:**

- Modify: `packages/resume-parse-queue/src/resume-semantic-index.ts`
- Modify: `apps/ai-recruitment-copilot-worker/src/index.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/indexer.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/indexer.test.ts`

- [x] Write tests for skip, index, failed, and unchanged profile hash behavior.
- [x] Run focused tests and verify they fail.
- [x] Add queue helpers and worker startup.
- [x] Implement indexer using DB source loading, text builders, embeddings, and vector store.
- [x] Run focused tests.

### Task 5: Dedup Service And Existing Endpoints

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/dedup-service.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/rerank.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/route.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/route.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/dedup-service.test.ts`

- [x] Write tests for semantic candidates, semantic-disabled empty results, Qdrant failure empty results, and score levels.
- [x] Run focused tests and verify they fail.
- [x] Implement semantic dedup service.
- [x] Replace endpoint internals while preserving legacy fields.
- [x] Run focused tests.

### Task 6: Frontend Dedup Review Overlay

**Files:**

- Modify: `apps/ai-recruitment-copilot/src/lib/client/api/endpoints/studio-interviews.ts`
- Modify: `apps/ai-recruitment-copilot/src/components/features/resume/resume-dedup-overlay.tsx`

- [x] Extend `DedupMatchRecord` with score, level, semantic reasons, conflicting signals, and similarity fields.
- [x] Update the overlay copy and card layout to show risk score and reasons.
- [x] Remove identity-only match rendering and show semantic reasons/similarity evidence.
- [x] Run web typecheck.

### Task 7: Verification

**Commands:**

- `pnpm --filter @arc/db-schema typecheck`
- `pnpm --filter @arc/resume-parse-queue typecheck`
- `pnpm --filter @arc/resume-parse-queue exec vitest run src/resume-semantic-index.test.ts`
- `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck`
- `pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/lib/server/resume-semantic/text-builders.test.ts src/lib/server/resume-semantic/embedding.test.ts src/lib/server/resume-semantic/qdrant-store.test.ts src/lib/server/resume-semantic/indexer.test.ts src/lib/server/resume-semantic/dedup-service.test.ts`
- `pnpm --filter @arc/ai-recruitment-copilot-worker typecheck`
- `pnpm --filter @arc/ai-recruitment-copilot typecheck`
- `pnpm check`

- [x] Run the commands above.
- [x] Fix any failures caused by this change.
- [x] Report any pre-existing or environment-blocked failures clearly.
