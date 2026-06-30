# Resume Duplicate Match Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make resume uploads and resume-pool imports always create records, while persisting suspected duplicate relationships with status so the UI can show and later resolve duplicate risk.

**Architecture:** Reuse the existing `resume_duplicate_match` table as the durable duplicate relationship store. Dedup detection becomes a post-create side effect: create the source resume or pool item first, then persist active match rows for that source. Query paths enrich list/detail DTOs with duplicate summary data, and future manual resolution can update `status` without schema churn.

**Tech Stack:** Drizzle ORM, PostgreSQL, Hono route handlers, TanStack Query client endpoints, React route components, Vitest, pnpm.

---

## Scope Decisions

- Use the existing `resume_duplicate_match` table instead of adding a second table.
- Add `status` now. Use `"active" | "confirmed" | "dismissed"`.
- New duplicate rows default to `active`.
- Default list badges count `active` and `confirmed`; `dismissed` is kept for audit/history but hidden from normal duplicate indicators.
- Do not use foreign keys for source or target resume IDs. Keep logical constraints only.
- Stop using duplicate matches to block creation in the touched flows.
- Keep old `duplicate_skipped` enum and UI handling for historical batches, but new flows should not produce it.
- Do not implement merge/dismiss UI in this pass. This pass creates the storage and display foundation.

## File Structure

- Modify `packages/db-schema/src/schema.ts`
  - Add `ResumeDuplicateMatchStatus`.
  - Add `status`, `updatedAt`, optional `similarity` to `resumeDuplicateMatch`.
  - Add unique index for one row per source-target-version pair.
- Create `apps/ai-recruitment-copilot/drizzle/20260630120000_resume_duplicate_match_status/migration.sql`
  - Add columns and indexes in SQL.
- Create `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/duplicate-matches.ts`
  - Persist and read duplicate match rows.
- Modify `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/__tests__/route.test.ts`
  - Replace the single-create duplicate-conflict expectation with a create-success plus persisted-match expectation.
- Modify `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/route.ts`
  - Stop returning 409 on create duplicate.
  - Persist matches after create.
- Modify `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-upload-batches/utils/processor.ts`
  - Stop deleting created records on duplicate.
  - Persist matches after successful source creation.
- Modify `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/dao.ts`
  - Stop returning `duplicate_found` from import.
  - Persist matches after import creates the library record.
- Modify `packages/shared/src/studio-resumes.ts` and `packages/shared/src/resume-pool.ts`
  - Add duplicate summary DTO fields.
- Modify resume library and resume pool list/detail DAOs
  - Batch-load duplicate summaries for returned records.
- Modify `apps/ai-recruitment-copilot/src/routes/w.$slug.studio.resume-pool.tsx`
  - Remove private upload dedup policy dialog.
  - Remove import conflict confirmation flow.
  - Display duplicate badge/summary.
- Modify `apps/ai-recruitment-copilot/src/components/features/studio/resumes/*`
  - Remove misleading "skip/create" choice from new bulk upload flows or make it inert only where still needed historically.
- Update focused tests around processor, pool DAO, route source tests, and DTO mappers.

---

### Task 1: Schema and Migration

**Files:**

- Modify: `packages/db-schema/src/schema.ts`
- Create: `apps/ai-recruitment-copilot/drizzle/20260630120000_resume_duplicate_match_status/migration.sql`

- [ ] **Step 1: Write a source test for the schema shape**

Add this focused backend source test:

```ts
// apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/duplicate-match-schema.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../../../../packages/db-schema/src/schema.ts", import.meta.url),
  "utf-8",
);

describe("resumeDuplicateMatch schema", () => {
  it("stores status, similarity, updatedAt and a source-target unique key", () => {
    expect(source).toContain(
      'export type ResumeDuplicateMatchStatus = "active" | "confirmed" | "dismissed";',
    );
    expect(source).toContain('status: text("status").$type<ResumeDuplicateMatchStatus>()');
    expect(source).toContain('similarity: jsonb("similarity")');
    expect(source).toContain('updatedAt: timestamp("updated_at", { withTimezone: true })');
    expect(source).toContain('uniqueIndex("resume_duplicate_match_source_target_version_uq")');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/lib/server/resume-semantic/duplicate-match-schema.test.ts
```

Expected: FAIL because the status type and fields do not exist yet.

- [ ] **Step 3: Update schema**

In `packages/db-schema/src/schema.ts`, change the duplicate match section to include:

```ts
export type ResumeDuplicateMatchStatus = "active" | "confirmed" | "dismissed";

export const resumeDuplicateMatch = pgTable(
  "resume_duplicate_match",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    embeddingVersion: text("embedding_version").notNull(),
    id: text("id").primaryKey(),
    level: text("level").$type<ResumeSemanticDuplicateLevel>().notNull(),
    matchedSourceId: text("matched_source_id").notNull(),
    matchedSourceType: text("matched_source_type").$type<ResumeSemanticSourceType>().notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reasons: jsonb("reasons")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    score: integer("score").notNull(),
    signals: jsonb("signals")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    similarity: jsonb("similarity").$type<{
      resumeOverview?: number;
      skillRole?: number;
      workProject?: number;
    }>(),
    sourceId: text("source_id").notNull(),
    sourceType: text("source_type").$type<ResumeSemanticSourceType>().notNull(),
    status: text("status").$type<ResumeDuplicateMatchStatus>().notNull().default("active"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("resume_duplicate_match_source_target_version_uq").on(
      table.organizationId,
      table.sourceType,
      table.sourceId,
      table.matchedSourceType,
      table.matchedSourceId,
      table.embeddingVersion,
    ),
    index("resume_duplicate_match_org_source_idx").on(
      table.organizationId,
      table.sourceType,
      table.sourceId,
      table.createdAt,
    ),
    index("resume_duplicate_match_org_level_idx").on(table.organizationId, table.level),
    index("resume_duplicate_match_org_status_idx").on(table.organizationId, table.status),
  ],
);
```

- [ ] **Step 4: Add SQL migration**

Create `apps/ai-recruitment-copilot/drizzle/20260630120000_resume_duplicate_match_status/migration.sql`:

```sql
ALTER TABLE "resume_duplicate_match"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "similarity" jsonb,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS "resume_duplicate_match_source_target_version_uq"
  ON "resume_duplicate_match" (
    "organization_id",
    "source_type",
    "source_id",
    "matched_source_type",
    "matched_source_id",
    "embedding_version"
  );

CREATE INDEX IF NOT EXISTS "resume_duplicate_match_org_status_idx"
  ON "resume_duplicate_match" ("organization_id", "status");
```

- [ ] **Step 5: Run the schema test**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/lib/server/resume-semantic/duplicate-match-schema.test.ts
```

Expected: PASS.

---

### Task 2: Duplicate Match Persistence DAO

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/duplicate-matches.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-semantic/duplicate-matches.test.ts`

- [ ] **Step 1: Write failing DAO tests**

```ts
import { describe, expect, it, vi } from "vitest";
import type { DedupMatchRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";
import { toDuplicateMatchInsertRows } from "./duplicate-matches";

const MATCH: DedupMatchRecord = {
  candidateEmail: "dup@example.com",
  candidateName: "重复候选人",
  candidatePhone: "13800138000",
  conflictingSignals: ["姓名相近"],
  createdAt: "2026-06-30T00:00:00.000Z",
  id: "target-resume-id",
  jobDescriptionName: null,
  level: "high",
  score: 92,
  semanticReasons: ["项目经历高度相似"],
  similarity: {
    resumeOverview: 0.91,
    skillRole: 0.88,
    workProject: 0.94,
  },
  status: "draft",
  targetRole: "前端工程师",
};

describe("toDuplicateMatchInsertRows", () => {
  it("maps semantic matches to active duplicate rows", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("match-row-id");

    expect(
      toDuplicateMatchInsertRows({
        embeddingVersion: "v1",
        matches: [MATCH],
        organizationId: "org-id",
        sourceId: "source-id",
        sourceType: "studio_interview",
      }),
    ).toEqual([
      {
        embeddingVersion: "v1",
        id: "match-row-id",
        level: "high",
        matchedSourceId: "target-resume-id",
        matchedSourceType: "studio_interview",
        organizationId: "org-id",
        reasons: ["项目经历高度相似"],
        score: 92,
        signals: ["姓名相近"],
        similarity: {
          resumeOverview: 0.91,
          skillRole: 0.88,
          workProject: 0.94,
        },
        sourceId: "source-id",
        sourceType: "studio_interview",
        status: "active",
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/lib/server/resume-semantic/duplicate-matches.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement mapper and write helper**

Create `duplicate-matches.ts`:

```ts
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type { DedupMatchRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";
import { resumeDuplicateMatch, type ResumeSemanticSourceType } from "@arc/db-schema/schema";
import { getResumeEmbeddingConfig } from "./embedding";

export interface PersistDuplicateMatchesInput {
  organizationId: string;
  sourceType: ResumeSemanticSourceType;
  sourceId: string;
  matches: DedupMatchRecord[];
  embeddingVersion?: string;
}

export function toDuplicateMatchInsertRows(input: Required<PersistDuplicateMatchesInput>) {
  return input.matches.map((match) => ({
    embeddingVersion: input.embeddingVersion,
    id: crypto.randomUUID(),
    level: match.level ?? "medium",
    matchedSourceId: match.id,
    matchedSourceType: "studio_interview" as const,
    organizationId: input.organizationId,
    reasons: match.semanticReasons ?? [],
    score: Math.round(match.score ?? 0),
    signals: match.conflictingSignals ?? [],
    similarity: match.similarity ?? null,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    status: "active" as const,
  }));
}

export async function replaceDuplicateMatchesForSource(
  input: PersistDuplicateMatchesInput,
): Promise<number> {
  const embeddingVersion = input.embeddingVersion ?? getResumeEmbeddingConfig().embeddingVersion;
  await db
    .delete(resumeDuplicateMatch)
    .where(
      and(
        eq(resumeDuplicateMatch.organizationId, input.organizationId),
        eq(resumeDuplicateMatch.sourceType, input.sourceType),
        eq(resumeDuplicateMatch.sourceId, input.sourceId),
        eq(resumeDuplicateMatch.embeddingVersion, embeddingVersion),
        eq(resumeDuplicateMatch.status, "active"),
      ),
    );

  if (input.matches.length === 0) {
    return 0;
  }

  const rows = toDuplicateMatchInsertRows({ ...input, embeddingVersion });
  await db
    .insert(resumeDuplicateMatch)
    .values(rows)
    .onConflictDoUpdate({
      set: {
        level: sql`excluded.level`,
        reasons: sql`excluded.reasons`,
        score: sql`excluded.score`,
        signals: sql`excluded.signals`,
        similarity: sql`excluded.similarity`,
        status: "active",
        updatedAt: new Date(),
      },
      target: [
        resumeDuplicateMatch.organizationId,
        resumeDuplicateMatch.sourceType,
        resumeDuplicateMatch.sourceId,
        resumeDuplicateMatch.matchedSourceType,
        resumeDuplicateMatch.matchedSourceId,
        resumeDuplicateMatch.embeddingVersion,
      ],
    });
  return rows.length;
}

export async function listActiveDuplicateMatchCounts(input: {
  organizationId: string;
  sourceType: ResumeSemanticSourceType;
  sourceIds: string[];
}): Promise<Map<string, { count: number; highestLevel: "high" | "low" | "medium" | null }>> {
  if (input.sourceIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      highestLevel: sql<"high" | "low" | "medium" | null>`
        CASE
          WHEN bool_or(${resumeDuplicateMatch.level} = 'high') THEN 'high'
          WHEN bool_or(${resumeDuplicateMatch.level} = 'medium') THEN 'medium'
          WHEN bool_or(${resumeDuplicateMatch.level} = 'low') THEN 'low'
          ELSE NULL
        END
      `,
      sourceId: resumeDuplicateMatch.sourceId,
    })
    .from(resumeDuplicateMatch)
    .where(
      and(
        eq(resumeDuplicateMatch.organizationId, input.organizationId),
        eq(resumeDuplicateMatch.sourceType, input.sourceType),
        inArray(resumeDuplicateMatch.sourceId, input.sourceIds),
        inArray(resumeDuplicateMatch.status, ["active", "confirmed"]),
      ),
    )
    .groupBy(resumeDuplicateMatch.sourceId);

  return new Map(rows.map((row) => [row.sourceId, row]));
}
```

- [ ] **Step 4: Run DAO test**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/lib/server/resume-semantic/duplicate-matches.test.ts
```

Expected: PASS.

---

### Task 3: Stop Blocking Single Resume Library Create

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/route.ts`
- Modify tests under: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/__tests__/`

- [ ] **Step 1: Write failing route behavior test**

Add a test asserting that `POST /studio/resumes` creates the record even when `findSemanticResumeDuplicates` returns matches, and calls `replaceDuplicateMatchesForSource` with the new record ID.

Expected assertion shape:

```ts
expect(response.status).toBe(201);
expect(replaceDuplicateMatchesForSource).toHaveBeenCalledWith({
  matches: [MATCH],
  organizationId: ORG_ID,
  sourceId: createdRecordId,
  sourceType: "studio_interview",
});
```

- [ ] **Step 2: Run focused route test and verify it fails**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/server/routes/studio/routes/resumes/__tests__/route.test.ts
```

Expected: FAIL because current code returns 409 before creating.

- [ ] **Step 3: Implement minimal route change**

In `route.ts`, remove the pre-create `dedupConflict` return block:

```ts
const dedupMatches = await findSemanticResumeDuplicates({
  email: input.data.candidateEmail || resumeProfile?.email || null,
  name: input.data.candidateName || resumeProfile?.name || null,
  organizationId: activeOrg.id,
  phone: input.data.candidatePhone || resumeProfile?.phone || null,
  resumeProfile,
});
```

After `createResumeRecordFromStorage`, persist matches:

```ts
await replaceDuplicateMatchesForSource({
  matches: dedupMatches,
  organizationId: activeOrg.id,
  sourceId: recordId,
  sourceType: "studio_interview",
});
```

Keep `parseResumeCreateDedupPolicy` exported only if still used by interview-create flows; otherwise remove local import.

- [ ] **Step 4: Run focused route test**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/server/routes/studio/routes/resumes/__tests__/route.test.ts
```

Expected: PASS.

---

### Task 4: Update Batch Processor Semantics

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-upload-batches/utils/processor.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-upload-batches/__tests__/processor.test.ts`

- [ ] **Step 1: Update tests first**

Change the private pool duplicate test from expecting `duplicate_skipped` to expecting `succeeded`, a retained `poolItemId`, and a persisted duplicate match.

Use this expected assertion:

```ts
expect(result?.item?.status).toBe("succeeded");
expect(result?.item?.poolItemId).toBeTruthy();
expect(result?.batch.skippedCount).toBe(0);
expect(replaceDuplicateMatchesForSource).toHaveBeenCalledWith({
  matches: [MATCH],
  organizationId: ORG_A,
  sourceId: result?.item?.poolItemId,
  sourceType: "resume_pool_item",
});
```

Add the equivalent assertion for resume-library batch items:

```ts
expect(result?.item?.status).toBe("succeeded");
expect(result?.item?.resumeRecordId).toBeTruthy();
expect(replaceDuplicateMatchesForSource).toHaveBeenCalledWith({
  matches: [MATCH],
  organizationId: ORG_A,
  sourceId: result?.item?.resumeRecordId,
  sourceType: "studio_interview",
});
```

- [ ] **Step 2: Run processor test and verify it fails**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/server/routes/studio/routes/resume-upload-batches/__tests__/processor.test.ts
```

Expected: FAIL because current code marks duplicate rows as `duplicate_skipped`.

- [ ] **Step 3: Implement processor change**

Replace `findDuplicateSkipSnapshot` with a neutral helper:

```ts
async function findDuplicateMatches(input: {
  itemId: string;
  organizationId: string;
  resumeProfile: ParsedResume["resumeProfile"];
}) {
  const dedupStartedAt = Date.now();
  logStep("dedup.start", { itemId: input.itemId });
  const matches = await findSemanticResumeDuplicates({
    email: input.resumeProfile?.email ?? null,
    name: input.resumeProfile?.name ?? null,
    organizationId: input.organizationId,
    phone: input.resumeProfile?.phone ?? null,
    resumeProfile: input.resumeProfile,
  });
  logStep("dedup.done", {
    durationMs: elapsed(dedupStartedAt),
    itemId: input.itemId,
    matchCount: matches.length,
  });
  return matches;
}
```

Remove `isDuplicateSkip` from `fetchAndParse` and `writeOutcome`. After creating the source record or pool item, call:

```ts
await replaceDuplicateMatchesForSource({
  matches: duplicateMatches,
  organizationId,
  sourceId: poolItemId,
  sourceType: "resume_pool_item",
});
```

or:

```ts
await replaceDuplicateMatchesForSource({
  matches: duplicateMatches,
  organizationId,
  sourceId: succeededRecordId,
  sourceType: "studio_interview",
});
```

Keep `duplicate_skipped` handling only in DTO/reconcile code for old rows.

- [ ] **Step 4: Run processor test**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/server/routes/studio/routes/resume-upload-batches/__tests__/processor.test.ts
```

Expected: PASS.

---

### Task 5: Update Resume Pool Import and Upload UX

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/dao.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/__tests__/dao.test.ts`
- Modify: `apps/ai-recruitment-copilot/src/routes/w.$slug.studio.resume-pool.tsx`
- Modify: `packages/shared/src/resume-pool.ts`

- [ ] **Step 1: Update backend DAO tests**

Change the `importPoolItemToResumeLibrary` duplicate test to expect import success plus persisted duplicate rows:

```ts
const result = await importPoolItemToResumeLibrary({
  dedupPolicy: "check",
  importedBy: USER_B,
  jobDescriptionId: null,
  organizationId: ORG_B,
  poolItemId: publicId,
});

expect(result.status).toBe("imported");
expect(result.resumeRecordId).toBeTruthy();
expect(replaceDuplicateMatchesForSource).toHaveBeenCalledWith({
  matches: [MATCH],
  organizationId: ORG_B,
  sourceId: result.resumeRecordId,
  sourceType: "studio_interview",
});
```

- [ ] **Step 2: Run DAO test and verify it fails**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/server/routes/studio/routes/resume-pool/__tests__/dao.test.ts
```

Expected: FAIL because current code returns `duplicate_found`.

- [ ] **Step 3: Implement DAO change**

In `importPoolItemToResumeLibrary`, keep the existing `findSemanticResumeDuplicates` call, but remove:

```ts
if (input.dedupPolicy === "check" && matches.length > 0) {
  return {
    matches,
    status: "duplicate_found",
  };
}
```

After successful import and semantic clone, call:

```ts
await replaceDuplicateMatchesForSource({
  matches,
  organizationId: input.organizationId,
  sourceId: resumeRecordId,
  sourceType: "studio_interview",
});
```

- [ ] **Step 4: Simplify shared import result**

In `packages/shared/src/resume-pool.ts`, keep duplicate result types only if still used by old client code. New import result should be:

```ts
export interface ResumePoolImportSuccessResult {
  duplicateMatchCount?: number;
  resumeRecordId: string;
  status: "imported";
}

export type ResumePoolImportResult = ResumePoolImportSuccessResult;
```

- [ ] **Step 5: Update frontend route source test**

In `apps/ai-recruitment-copilot/src/routes/__test__/-resume-pool-masonry.test.ts`, replace the old conflict-dialog assertion with assertions that the route no longer renders `ResumeDedupMatchList` for import conflicts and no longer opens `PrivateResumePoolUploadPolicyDialog`.

Expected source assertions:

```ts
expect(source).not.toContain("PrivateResumePoolUploadPolicyDialog");
expect(source).not.toContain('mutation.mutate("force")');
expect(source).not.toContain("duplicate_found");
```

- [ ] **Step 6: Update frontend route**

In `w.$slug.studio.resume-pool.tsx`:

- Remove `PrivateResumePoolUploadPolicyDialog`.
- Change private upload to call `startQueuedUpload(files, "private", "create")`.
- Remove `duplicates` state and `AlertDialog` from `ImportResumePoolDialog`.
- Make confirm button call import once.
- On success, show:

```ts
toast.success(
  result.duplicateMatchCount && result.duplicateMatchCount > 0
    ? `已入库到简历库，检测到 ${result.duplicateMatchCount} 条疑似重复`
    : "已入库到简历库",
);
```

- [ ] **Step 7: Run focused frontend source test**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot test -- src/routes/__test__/-resume-pool-masonry.test.ts
```

Expected: PASS.

---

### Task 6: Duplicate Summary DTOs and Badges

**Files:**

- Modify: `packages/shared/src/studio-resumes.ts`
- Modify: `packages/shared/src/resume-pool.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/dao/resumes.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/dao.ts`
- Modify relevant resume list/detail UI files.

- [ ] **Step 1: Add DTO fields**

Add to resume-library list/detail DTOs:

```ts
duplicateHighestLevel: "high" | "low" | "medium" | null;
duplicateMatchCount: number;
```

Add the same to `ResumePoolListRecord`.

- [ ] **Step 2: Write DAO tests**

Add tests asserting list rows include duplicate summary when `resume_duplicate_match` has active rows:

```ts
expect(record.duplicateMatchCount).toBe(2);
expect(record.duplicateHighestLevel).toBe("high");
```

Also assert dismissed-only rows are hidden:

```ts
expect(record.duplicateMatchCount).toBe(0);
expect(record.duplicateHighestLevel).toBeNull();
```

- [ ] **Step 3: Run DAO tests and verify failure**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run src/server/routes/studio/routes/resumes/__tests__/dao.test.ts src/server/routes/studio/routes/resume-pool/__tests__/dao.test.ts
```

Expected: FAIL because fields are not populated.

- [ ] **Step 4: Implement summary loading**

In list DAOs, after selecting page rows:

```ts
const duplicateSummaries = await listActiveDuplicateMatchCounts({
  organizationId,
  sourceIds: rows.map((row) => row.id),
  sourceType: "studio_interview",
});
```

For pool rows:

```ts
const duplicateSummaries = await listActiveDuplicateMatchCounts({
  organizationId: input.organizationId,
  sourceIds: rows.map((row) => row.item.id),
  sourceType: "resume_pool_item",
});
```

Map to DTO:

```ts
const duplicateSummary = duplicateSummaries.get(row.id);
duplicateMatchCount: duplicateSummary?.count ?? 0,
duplicateHighestLevel: duplicateSummary?.highestLevel ?? null,
```

- [ ] **Step 5: Add UI badge**

Use a small shared helper or inline badge:

```tsx
function DuplicateRiskBadge({
  count,
  level,
}: {
  count: number;
  level: "high" | "low" | "medium" | null;
}) {
  if (count <= 0) {
    return null;
  }
  const label = level === "high" ? "高度疑似重复" : "疑似重复";
  return (
    <Badge variant={level === "high" ? "destructive" : "secondary"}>
      {label} {count}
    </Badge>
  );
}
```

- [ ] **Step 6: Run focused UI tests**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot test -- src/routes/__test__/-resume-pool-masonry.test.ts
```

Expected: PASS.

---

### Task 7: Verification

**Files:** No production edits.

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend exec vitest run \
  src/lib/server/resume-semantic/duplicate-matches.test.ts \
  src/server/routes/studio/routes/resume-upload-batches/__tests__/processor.test.ts \
  src/server/routes/studio/routes/resume-pool/__tests__/dao.test.ts \
  src/server/routes/studio/routes/resumes/__tests__/route.test.ts \
  src/server/routes/studio/routes/resumes/__tests__/dao.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run frontend focused tests**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot test -- \
  src/routes/__test__/-resume-pool-masonry.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

Expected: PASS.

- [ ] **Step 4: Run repo lint/check**

Run:

```bash
pnpm check
git diff --check
```

Expected: PASS.

---

## Rollout Notes

- Existing historical `duplicate_skipped` batch rows remain readable.
- New uploads should no longer produce `duplicate_skipped`.
- If the unique index finds old duplicate rows that violate uniqueness, run a one-off cleanup before migration in production.
- Because source and target IDs are logical references without foreign keys, delete flows should call `deleteResumeSemanticIndexBestEffort` and also best-effort delete or dismiss duplicate rows for that source.
- The first implementation should not add merge/dismiss UI. It should only write status and show duplicate risk.
