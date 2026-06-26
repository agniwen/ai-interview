# Interview Evidence Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement steps 1-4 of the evaluation pipeline: freeze interview context at creation, allow explicit refresh, read runtime context from the frozen snapshot, and build an evidence snapshot after agent report.

**Architecture:** Add append-only context/evidence snapshot tables and a focused DAO. Interview creation writes the first active context snapshot. Explicit refresh supersedes the old active snapshot and writes a new one. Candidate-facing token/prompt paths read the active snapshot; agent report creates an evidence snapshot after transcript persistence.

**Tech Stack:** Drizzle ORM schema, Hono routes, Vitest, TypeScript, PostgreSQL JSONB.

---

### Task 1: Snapshot Schema and Types

**Files:**

- Modify: `packages/db-schema/src/schema.ts`
- Create: `packages/db-schema/src/interview-snapshots.ts`

- [x] Add `interviewContextSnapshot` and `interviewEvidenceSnapshot` tables with JSONB payloads, content hash, status/version metadata, and indexes for interview/round/conversation lookups.
- [x] Add shared TypeScript payload types for context and evidence snapshots.
- [x] Cover payload construction through context/evidence snapshot tests.

### Task 2: Context Snapshot DAO

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/dao/context-snapshots.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/dao/__tests__/context-snapshots.test.ts`

- [x] Write failing tests that verify initial snapshot creation freezes current form versions, question template versions, personalized questions, and global/JD context.
- [x] Implement `createInterviewContextSnapshot`, `loadActiveInterviewContextSnapshot`, and `refreshInterviewContextSnapshot`.
- [x] Verify explicit refresh supersedes the old active snapshot and leaves the old row readable.

### Task 3: Interview Lifecycle Integration

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/route.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/interview/route.ts`
- Test: focused route/DAO tests under existing `__tests__` folders.

- [x] Create context snapshots during interview creation.
- [x] Add refresh endpoint that writes a new active snapshot and audit log.
- [x] Switch prompt preview and LiveKit token metadata to read active context snapshot.
- [x] Switch candidate form gate/listing to read required forms from active context snapshot.

### Task 4: Evidence Snapshot on Agent Report

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/agent/utils/evidence-snapshot.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/agent/route.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/agent/utils/__tests__/evidence-snapshot.test.ts`

- [x] Write failing tests that build evidence from active context snapshot, transcript, form submissions, and recording metadata.
- [x] Implement evidence snapshot creation after transcript persistence in `/api/agent/report`.
- [x] Make the operation idempotent by content hash per conversation.

### Task 5: Verification

**Files:**

- Existing package configs only.

- [x] Run backend tests touching interview snapshots.
- [x] Run backend typecheck.
- [x] Run root checks only if the focused suite passes.
