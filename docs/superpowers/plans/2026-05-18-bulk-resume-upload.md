# 简历库 — 批量上传 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在简历库新增「批量上传」入口：用户一次最多选 100 份 PDF，浏览器驱动逐份解析+查重+入库，进度持久化到 DB，关闭浏览器后可从中断处继续。

**Architecture:** 新增 `resume_upload_batch` + `resume_upload_batch_item` 两张表（租户+用户隔离）。新 Hono 子路由 `studio/routes/resume-upload-batches/`。文件上传复用既有 `storeInterviewResume`（hash-based registry），创建简历记录核心逻辑抽到共享 `createResumeRecordFromStorage` 函数，单份 POST `/studio/resumes` 与 `process-next` 都调它。前端浏览器串行调 `POST /:id/process-next`，每次推进一份；DB 用 `FOR UPDATE SKIP LOCKED` + partial unique index 兜底并发。

**Tech Stack:** Next.js 16 App Router、Hono、Drizzle ORM、Better Auth、Zod、TanStack Query、shadcn/ui。Vitest + 真 PG 跑后端测试，RTL 跑前端测试。

**Design spec:** `docs/superpowers/specs/2026-05-18-bulk-resume-upload-design.md`

> **重要偏离 spec 的点：** spec 写了 storage key 前缀校验，但实际 `storeInterviewResume` 写到 hash-based registry（`attachments/by-hash/{hash}.pdf`），不是 batch 路径。计划改用 **DB 校验**：每个 storageKey 必须在 `chat_attachment` 表里存在（由 `/uploads` 调用 `storeInterviewResume` 时写入）。

---

## File map

| File                                                                                 | Action | Purpose                                       |
| ------------------------------------------------------------------------------------ | ------ | --------------------------------------------- |
| `src/lib/shared/db/schema.ts`                                                        | Modify | 增加两张表                                    |
| `src/lib/shared/bulk-resume-upload.ts`                                               | Create | 共享类型 + Zod schema                         |
| `src/server/routes/studio/routes/resumes/utils/create-from-storage.ts`               | Create | 抽取的创建函数                                |
| `src/server/routes/studio/routes/resumes/route.ts`                                   | Modify | POST `/` 改调 `createResumeRecordFromStorage` |
| `src/server/routes/studio/routes/resume-upload-batches/dao/batches.ts`               | Create | DAO                                           |
| `src/server/routes/studio/routes/resume-upload-batches/utils/processor.ts`           | Create | process-next 主体                             |
| `src/server/routes/studio/routes/resume-upload-batches/schema.ts`                    | Create | 路由 Zod                                      |
| `src/server/routes/studio/routes/resume-upload-batches/route.ts`                     | Create | Hono 路由                                     |
| `src/server/routes/studio/routes/resume-upload-batches/__tests__/*.test.ts`          | Create | 测试                                          |
| `src/server/routes/studio/route.ts`                                                  | Modify | 挂载 `/resume-upload-batches`                 |
| `src/lib/client/api/bulk-resume-upload.ts`                                           | Create | 前端 RPC 包装                                 |
| `src/app/(auth)/w/[slug]/studio/resumes/_components/use-bulk-upload.ts`              | Create | 状态机 hook                                   |
| `src/app/(auth)/w/[slug]/studio/resumes/_components/bulk-upload-confirm-dialog.tsx`  | Create | 确认 dialog                                   |
| `src/app/(auth)/w/[slug]/studio/resumes/_components/bulk-upload-progress-dialog.tsx` | Create | 进度 dialog                                   |
| `src/app/(auth)/w/[slug]/studio/resumes/_components/active-batch-banner.tsx`         | Create | 顶部 banner                                   |
| `src/app/(auth)/w/[slug]/studio/resumes/_components/bulk-upload-button.tsx`          | Create | 入口按钮                                      |
| `src/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page.tsx`         | Modify | 接入按钮 + banner                             |

---

## Task 1: 增加两张表到 schema

**Files:**

- Modify: `src/lib/shared/db/schema.ts`

- [ ] **Step 1: 在 `studioInterviewSchedule` 表之后追加两张表**

在 `src/lib/shared/db/schema.ts` 中、`export const studioInterviewSchedule` 定义结束后插入：

```ts
export type ResumeUploadBatchStatus = "pending" | "running" | "completed" | "cancelled";
export type ResumeUploadBatchJdMode = "bind" | "auto" | "none";
export type ResumeUploadBatchDedupPolicy = "skip" | "create";
export type ResumeUploadBatchItemStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "duplicate_skipped"
  | "cancelled";

export const resumeUploadBatch = pgTable(
  "resume_upload_batch",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").$type<ResumeUploadBatchStatus>().notNull(),
    jdMode: text("jd_mode").$type<ResumeUploadBatchJdMode>().notNull(),
    // oxlint-disable-next-line no-use-before-define
    jobDescriptionId: text("job_description_id").references(() => jobDescription.id, {
      onDelete: "set null",
    }),
    dedupPolicy: text("dedup_policy").$type<ResumeUploadBatchDedupPolicy>().notNull(),
    totalCount: integer("total_count").notNull(),
    processedCount: integer("processed_count").notNull().default(0),
    succeededCount: integer("succeeded_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("resume_upload_batch_org_user_status_idx").on(
      table.organizationId,
      table.createdBy,
      table.status,
    ),
    index("resume_upload_batch_org_user_created_idx").on(
      table.organizationId,
      table.createdBy,
      table.createdAt,
    ),
    // 单用户单租户活跃批次唯一约束（partial unique index）。
    // Active-batch uniqueness per (org, user); only one pending/running allowed.
    uniqueIndex("resume_upload_batch_active_unique_idx")
      .on(table.organizationId, table.createdBy)
      .where(sql`${table.status} in ('pending','running')`),
  ],
);

export const resumeUploadBatchItem = pgTable(
  "resume_upload_batch_item",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => resumeUploadBatch.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    orderIndex: integer("order_index").notNull(),
    originalFileName: text("original_file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    storageKey: text("storage_key").notNull(),
    status: text("status").$type<ResumeUploadBatchItemStatus>().notNull(),
    resumeRecordId: text("resume_record_id").references(() => studioInterview.id, {
      onDelete: "set null",
    }),
    errorMessage: text("error_message"),
    dedupMatchSnapshot: jsonb("dedup_match_snapshot"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    index("resume_upload_batch_item_batch_order_idx").on(table.batchId, table.orderIndex),
    index("resume_upload_batch_item_batch_status_idx").on(table.batchId, table.status),
  ],
);
```

注意：`uniqueIndex(...).where(sql\`...\`)`需要从`drizzle-orm`顶层 import`sql`。检查文件顶部，如果没有 `sql`，把 `import { sql } from "drizzle-orm";` 加上。

- [ ] **Step 2: 生成迁移**

Run:

```bash
pnpm db:generate
```

Expected: `drizzle/<timestamp>_*.sql` 新文件，包含两张表 + 索引 + partial unique。

- [ ] **Step 3: 校验 partial unique index 语法**

打开新生成的 sql 文件，确认有这行（具体表达可能略有不同但语义需正确）：

```sql
CREATE UNIQUE INDEX "resume_upload_batch_active_unique_idx" ON "resume_upload_batch" ("organization_id","created_by") WHERE "status" in ('pending','running');
```

如不存在，回到 schema 检查 `where(sql\`...\`)` 写法。

- [ ] **Step 4: 应用迁移**

Run:

```bash
pnpm db:migrate
```

Expected: `applied X migrations` 且无报错。

- [ ] **Step 5: 提交**

```bash
git add src/lib/shared/db/schema.ts drizzle/
git commit -m "feat(db): add resume_upload_batch tables for bulk upload"
```

---

## Task 2: 共享类型 + Zod schema

**Files:**

- Create: `src/lib/shared/bulk-resume-upload.ts`

- [ ] **Step 1: 写文件**

```ts
import { z } from "zod";
import type {
  ResumeUploadBatchDedupPolicy,
  ResumeUploadBatchItemStatus,
  ResumeUploadBatchJdMode,
  ResumeUploadBatchStatus,
} from "@/lib/shared/db/schema";

export const MAX_BULK_BATCH_SIZE = 100;
export const MAX_RESUME_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const ORPHAN_THRESHOLD_SECONDS = 60;

// /uploads 单文件返回。
export interface BulkResumeUploadFileDescriptor {
  storageKey: string;
  contentHash: string;
  originalFileName: string;
  fileSize: number;
}

// POST / 创建 batch 请求。
export const createBulkResumeBatchSchema = z.object({
  jdMode: z.enum(["bind", "auto", "none"]),
  jobDescriptionId: z.string().min(1).nullable().optional(),
  dedupPolicy: z.enum(["skip", "create"]),
  files: z
    .array(
      z.object({
        storageKey: z.string().min(1),
        originalFileName: z.string().min(1).max(500),
        fileSize: z.number().int().positive().max(MAX_RESUME_FILE_SIZE_BYTES),
      }),
    )
    .min(1)
    .max(MAX_BULK_BATCH_SIZE),
});

export type CreateBulkResumeBatchInput = z.infer<typeof createBulkResumeBatchSchema>;

export interface BulkResumeBatchDto {
  id: string;
  status: ResumeUploadBatchStatus;
  jdMode: ResumeUploadBatchJdMode;
  jobDescriptionId: string | null;
  dedupPolicy: ResumeUploadBatchDedupPolicy;
  totalCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface BulkResumeBatchItemDto {
  id: string;
  batchId: string;
  orderIndex: number;
  originalFileName: string;
  fileSize: number;
  status: ResumeUploadBatchItemStatus;
  resumeRecordId: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BulkResumeBatchDetailDto {
  batch: BulkResumeBatchDto;
  items: BulkResumeBatchItemDto[];
}

export interface ProcessNextResult {
  batch: BulkResumeBatchDto;
  item: BulkResumeBatchItemDto | null;
  done: boolean;
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: 提交**

```bash
git add src/lib/shared/bulk-resume-upload.ts
git commit -m "feat(shared): add bulk resume upload types"
```

---

## Task 3: 抽取 `createResumeRecordFromStorage`

把现有 `POST /studio/resumes` 里"从已上传文件创建简历记录"那段抽到独立函数，让 process-next 和单份 POST 都调它。

**Files:**

- Create: `src/server/routes/studio/routes/resumes/utils/create-from-storage.ts`
- Modify: `src/server/routes/studio/routes/resumes/route.ts`

- [ ] **Step 1: 写工具函数**

`src/server/routes/studio/routes/resumes/utils/create-from-storage.ts`：

```ts
import "server-only";

import { db } from "@/lib/server/db";
import { studioInterview } from "@/lib/shared/db/schema";
import type { ResumeProfile } from "@/lib/shared/interview/types";

export interface CreateResumeRecordFromStorageInput {
  organizationId: string;
  userId: string;
  storageKey: string;
  contentHash: string | null;
  resumeFileName: string;
  resumeProfile: ResumeProfile | null;
  jobDescriptionId: string | null;
  notes: string | null;
  candidateName: string | null;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
}

// 仅"从 S3 已经上传好的文件"创建一行 studio_interview。**不**做：dedup、JD
// 匹配、文件上传——这些由调用方负责。返回插入的 record id。
//
// Creates a single studio_interview row from an already-uploaded resume. The
// caller is responsible for dedup/JD-matching/upload. Returns the new record id.
export async function createResumeRecordFromStorage(
  input: CreateResumeRecordFromStorageInput,
): Promise<string> {
  const now = new Date();
  const recordId = crypto.randomUUID();
  await db.insert(studioInterview).values({
    candidateEmail: input.candidateEmail,
    candidateName: input.candidateName?.trim() || input.resumeProfile?.name || "未命名候选人",
    candidatePhone: input.candidatePhone ?? input.resumeProfile?.phone ?? null,
    createdAt: now,
    createdBy: input.userId,
    id: recordId,
    interviewQuestions: [],
    jobDescriptionId: input.jobDescriptionId,
    notes: input.notes,
    organizationId: input.organizationId,
    resumeContentHash: input.contentHash,
    resumeFileName: input.resumeFileName,
    resumeProfile: input.resumeProfile,
    resumeStorageKey: input.storageKey,
    status: "draft" as const,
    targetRole: input.targetRole?.trim() || input.resumeProfile?.targetRoles?.[0] || null,
    updatedAt: now,
  });
  return recordId;
}
```

- [ ] **Step 2: 让单份 POST 改用它**

打开 `src/server/routes/studio/routes/resumes/route.ts`，在 `POST /` 处理器里：

- 顶部增加 `import { createResumeRecordFromStorage } from "@/server/routes/studio/routes/resumes/utils/create-from-storage";`
- 替换内联的 `db.insert(studioInterview).values(row)` 那段，改用 `createResumeRecordFromStorage` 调用：

定位现有这段（line 317-337 左右）：

```ts
const row = {
  candidateEmail: input.data.candidateEmail || null,
  candidateName: input.data.candidateName || resumeProfile?.name || "未命名候选人",
  // ...
} satisfies typeof studioInterview.$inferInsert;

await db.insert(studioInterview).values(row);
```

替换为：

```ts
const recordId = await createResumeRecordFromStorage({
  organizationId: activeOrg.id,
  userId: c.var.user?.id ?? "",
  storageKey: resumeStorageKey ?? "",
  contentHash: resumeContentHash,
  resumeFileName: parsedFileName ?? "resume.pdf",
  resumeProfile,
  jobDescriptionId: input.data.jobDescriptionId || null,
  notes: input.data.notes || null,
  candidateName: input.data.candidateName || null,
  candidateEmail: input.data.candidateEmail || null,
  candidatePhone: input.data.candidatePhone || null,
  targetRole: input.data.targetRole || null,
});
```

注意：原代码里 `recordId` 是在调用前生成的；这里改成 helper 内部生成并返回，所以 `loadResumeDetail(recordId, ...)` 那一行直接用新返回的 `recordId`。把原先 `const recordId = crypto.randomUUID();` 那行删掉。

> **注意**：原代码里 `interviewQuestions: parsedResumePayload?.interviewQuestions ?? []` 允许客户端传 questions。批量场景不传 questions，而抽出来的 helper 也固定为 `[]`，符合 spec "批量入库不出题"。单份 POST 由此回归点会丢失"客户端传 questions"能力——但实际看代码（line 324），只有 `parsedResumePayload?.interviewQuestions` 这一处依赖它，而且简历库 dialog（line 67）里 save-only 路径**没传** interviewQuestions（只在 save-and-start 路径走 studio_interviews POST 端点，不走这里）。所以这次重构对实际行为无影响。

如果想保险，把 helper 加一个可选 `interviewQuestions: InterviewQuestion[]` 入参，单份 POST 传 `parsedResumePayload?.interviewQuestions ?? []`，process-next 传 `[]`。**推荐加上**，保留语义：

修改 helper 接受 `interviewQuestions?: InterviewQuestion[]` 默认 `[]`，写到 `studioInterview.interviewQuestions`。

- [ ] **Step 3: 跑现有简历库测试**

```bash
pnpm test -- src/server/routes/studio/routes/resumes
```

Expected: 全部 PASS。

- [ ] **Step 4: 提交**

```bash
git add src/server/routes/studio/routes/resumes
git commit -m "refactor(resumes): extract createResumeRecordFromStorage"
```

---

## Task 4: DAO — batches

**Files:**

- Create: `src/server/routes/studio/routes/resume-upload-batches/dao/batches.ts`

- [ ] **Step 1: 写 DAO**

```ts
import "server-only";

import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/server/db";
import {
  resumeUploadBatch,
  resumeUploadBatchItem,
  type ResumeUploadBatchItemStatus,
  type ResumeUploadBatchStatus,
} from "@/lib/shared/db/schema";
import type {
  BulkResumeBatchDetailDto,
  BulkResumeBatchDto,
  BulkResumeBatchItemDto,
} from "@/lib/shared/bulk-resume-upload";
import { ORPHAN_THRESHOLD_SECONDS } from "@/lib/shared/bulk-resume-upload";

type Row = typeof resumeUploadBatch.$inferSelect;
type ItemRow = typeof resumeUploadBatchItem.$inferSelect;

function toBatchDto(row: Row): BulkResumeBatchDto {
  return {
    id: row.id,
    status: row.status,
    jdMode: row.jdMode,
    jobDescriptionId: row.jobDescriptionId,
    dedupPolicy: row.dedupPolicy,
    totalCount: row.totalCount,
    processedCount: row.processedCount,
    succeededCount: row.succeededCount,
    failedCount: row.failedCount,
    skippedCount: row.skippedCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

function toItemDto(row: ItemRow): BulkResumeBatchItemDto {
  return {
    id: row.id,
    batchId: row.batchId,
    orderIndex: row.orderIndex,
    originalFileName: row.originalFileName,
    fileSize: row.fileSize,
    status: row.status,
    resumeRecordId: row.resumeRecordId,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

export interface CreateBatchInput {
  organizationId: string;
  userId: string;
  jdMode: "bind" | "auto" | "none";
  jobDescriptionId: string | null;
  dedupPolicy: "skip" | "create";
  files: { storageKey: string; originalFileName: string; fileSize: number }[];
}

export async function insertBatchWithItems(input: CreateBatchInput): Promise<string> {
  const batchId = crypto.randomUUID();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(resumeUploadBatch).values({
      id: batchId,
      organizationId: input.organizationId,
      createdBy: input.userId,
      status: "pending",
      jdMode: input.jdMode,
      jobDescriptionId: input.jobDescriptionId,
      dedupPolicy: input.dedupPolicy,
      totalCount: input.files.length,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(resumeUploadBatchItem).values(
      input.files.map((f, i) => ({
        id: crypto.randomUUID(),
        batchId,
        organizationId: input.organizationId,
        orderIndex: i,
        originalFileName: f.originalFileName,
        fileSize: f.fileSize,
        storageKey: f.storageKey,
        status: "pending" as ResumeUploadBatchItemStatus,
      })),
    );
  });
  return batchId;
}

export async function loadBatchDetail(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<BulkResumeBatchDetailDto | null> {
  const [row] = await db
    .select()
    .from(resumeUploadBatch)
    .where(
      and(
        eq(resumeUploadBatch.id, batchId),
        eq(resumeUploadBatch.organizationId, organizationId),
        eq(resumeUploadBatch.createdBy, userId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  const items = await db
    .select()
    .from(resumeUploadBatchItem)
    .where(eq(resumeUploadBatchItem.batchId, batchId))
    .orderBy(asc(resumeUploadBatchItem.orderIndex));
  return { batch: toBatchDto(row), items: items.map(toItemDto) };
}

export async function loadActiveBatch(
  organizationId: string,
  userId: string,
): Promise<BulkResumeBatchDetailDto | null> {
  const [row] = await db
    .select()
    .from(resumeUploadBatch)
    .where(
      and(
        eq(resumeUploadBatch.organizationId, organizationId),
        eq(resumeUploadBatch.createdBy, userId),
        inArray(resumeUploadBatch.status, ["pending", "running"] as ResumeUploadBatchStatus[]),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  return loadBatchDetail(row.id, organizationId, userId);
}

export async function listBatches(
  organizationId: string,
  userId: string,
  limit = 20,
): Promise<BulkResumeBatchDto[]> {
  const rows = await db
    .select()
    .from(resumeUploadBatch)
    .where(
      and(
        eq(resumeUploadBatch.organizationId, organizationId),
        eq(resumeUploadBatch.createdBy, userId),
      ),
    )
    .orderBy(desc(resumeUploadBatch.createdAt))
    .limit(limit);
  return rows.map(toBatchDto);
}

/**
 * Claim the next pending item for processing using FOR UPDATE SKIP LOCKED.
 * Returns the locked item row (within the same transaction caller passes), or null.
 */
export async function claimNextPendingItem(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  batchId: string,
): Promise<ItemRow | null> {
  const result = await tx.execute(sql`
    select * from ${resumeUploadBatchItem}
    where ${resumeUploadBatchItem.batchId} = ${batchId}
      and ${resumeUploadBatchItem.status} = 'pending'
    order by ${resumeUploadBatchItem.orderIndex} asc
    limit 1
    for update skip locked
  `);
  const row = (result as unknown as { rows: ItemRow[] }).rows[0];
  if (!row) {
    return null;
  }
  const now = new Date();
  await tx
    .update(resumeUploadBatchItem)
    .set({ status: "processing", startedAt: now })
    .where(eq(resumeUploadBatchItem.id, row.id));
  // 把 batch.status 从 pending 推到 running（幂等）。
  await tx
    .update(resumeUploadBatch)
    .set({ status: "running", updatedAt: now })
    .where(and(eq(resumeUploadBatch.id, batchId), eq(resumeUploadBatch.status, "pending")));
  return { ...row, status: "processing", startedAt: now };
}

export async function reviveOrphans(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [batch] = await tx
      .select({ id: resumeUploadBatch.id })
      .from(resumeUploadBatch)
      .where(
        and(
          eq(resumeUploadBatch.id, batchId),
          eq(resumeUploadBatch.organizationId, organizationId),
          eq(resumeUploadBatch.createdBy, userId),
        ),
      )
      .limit(1);
    if (!batch) {
      return;
    }
    await tx
      .update(resumeUploadBatchItem)
      .set({ status: "pending", startedAt: null })
      .where(
        and(
          eq(resumeUploadBatchItem.batchId, batchId),
          eq(resumeUploadBatchItem.status, "processing"),
          lt(
            resumeUploadBatchItem.startedAt,
            sql`now() - interval '${sql.raw(String(ORPHAN_THRESHOLD_SECONDS))} seconds'`,
          ),
        ),
      );
    await tx
      .update(resumeUploadBatch)
      .set({ status: "pending", updatedAt: new Date() })
      .where(and(eq(resumeUploadBatch.id, batchId), eq(resumeUploadBatch.status, "running")));
  });
}

export async function cancelBatch(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  let cancelled = false;
  await db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(resumeUploadBatch)
      .where(
        and(
          eq(resumeUploadBatch.id, batchId),
          eq(resumeUploadBatch.organizationId, organizationId),
          eq(resumeUploadBatch.createdBy, userId),
        ),
      )
      .limit(1);
    if (!batch || batch.status === "completed" || batch.status === "cancelled") {
      return;
    }
    const now = new Date();
    await tx
      .update(resumeUploadBatchItem)
      .set({ status: "cancelled", finishedAt: now })
      .where(
        and(
          eq(resumeUploadBatchItem.batchId, batchId),
          inArray(resumeUploadBatchItem.status, ["pending", "processing"]),
        ),
      );
    await tx
      .update(resumeUploadBatch)
      .set({ status: "cancelled", completedAt: now, updatedAt: now })
      .where(eq(resumeUploadBatch.id, batchId));
    cancelled = true;
  });
  return cancelled;
}

export async function deleteBatch(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .delete(resumeUploadBatch)
    .where(
      and(
        eq(resumeUploadBatch.id, batchId),
        eq(resumeUploadBatch.organizationId, organizationId),
        eq(resumeUploadBatch.createdBy, userId),
        inArray(resumeUploadBatch.status, ["completed", "cancelled"]),
      ),
    )
    .returning({ id: resumeUploadBatch.id });
  return result.length > 0;
}

export { toBatchDto, toItemDto };
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: 提交**

```bash
git add src/server/routes/studio/routes/resume-upload-batches/dao
git commit -m "feat(bulk-upload): DAO for batches and items"
```

---

## Task 5: DAO 测试

**Files:**

- Create: `src/server/routes/studio/routes/resume-upload-batches/__tests__/batches.dao.test.ts`

- [ ] **Step 1: 写测试**

按 `src/server/routes/studio/routes/resumes/__tests__/route.test.ts` 同款脚手架建 user/org/member fixtures，然后断言：

- `insertBatchWithItems` 创建 batch + N items（pending）
- 第二次调用相同 user+org → 抛唯一约束错（断言 message 含 `resume_upload_batch_active_unique_idx` 或 `unique`）
- `loadActiveBatch` 返回 pending batch；首批完成后返回 null
- `claimNextPendingItem` 在并发事务中只让一个事务拿到行（开两个 client）
- `reviveOrphans` 把 startedAt < now-60s 的 processing 改回 pending；新鲜的不动
- `cancelBatch` 把 pending/processing items 改 cancelled，已 succeeded 不动
- `deleteBatch` 仅 completed/cancelled 可删；删除时 cascade items
- 跨 org / 跨 user 隔离断言

由于这是测试样板代码量较大，每个用例写一个 `it()` block。**关键约束**：用真 PG（`db.delete(...)` 在 `afterAll` 清理）。

- [ ] **Step 2: 跑测试**

```bash
pnpm test -- src/server/routes/studio/routes/resume-upload-batches/__tests__/batches.dao.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 3: 提交**

```bash
git add src/server/routes/studio/routes/resume-upload-batches/__tests__/batches.dao.test.ts
git commit -m "test(bulk-upload): DAO unit tests"
```

---

## Task 6: Processor（process-next 主体）

**Files:**

- Create: `src/server/routes/studio/routes/resume-upload-batches/utils/processor.ts`

- [ ] **Step 1: 写 processor**

```ts
import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { resumeUploadBatch, resumeUploadBatchItem, studioInterview } from "@/lib/shared/db/schema";
import { getObjectStream } from "@/lib/server/s3";
import { parseResumeFastToProfile } from "@/server/agents/resume-analysis-agent";
import { queryInterviewDedup } from "@/server/routes/studio/routes/interviews/dao/studio-interviews";
import { createResumeRecordFromStorage } from "@/server/routes/studio/routes/resumes/utils/create-from-storage";
import {
  claimNextPendingItem,
  loadBatchDetail,
  toBatchDto,
  toItemDto,
} from "@/server/routes/studio/routes/resume-upload-batches/dao/batches";
import type { ProcessNextResult } from "@/lib/shared/bulk-resume-upload";

const ERROR_MESSAGE_MAX = 500;

function truncate(s: string): string {
  return s.length > ERROR_MESSAGE_MAX ? `${s.slice(0, ERROR_MESSAGE_MAX - 1)}…` : s;
}

export async function processNextItem(
  batchId: string,
  organizationId: string,
  userId: string,
): Promise<ProcessNextResult | null> {
  // 1) Claim next item in a short transaction.
  const claimed = await db.transaction(async (tx) => {
    const [batchRow] = await tx
      .select()
      .from(resumeUploadBatch)
      .where(
        and(
          eq(resumeUploadBatch.id, batchId),
          eq(resumeUploadBatch.organizationId, organizationId),
          eq(resumeUploadBatch.createdBy, userId),
        ),
      )
      .limit(1);
    if (!batchRow) {
      return null;
    }
    if (batchRow.status === "cancelled" || batchRow.status === "completed") {
      return { batchRow, item: null };
    }
    const item = await claimNextPendingItem(tx, batchId);
    return { batchRow, item };
  });

  if (!claimed) {
    return null;
  }
  if (!claimed.item) {
    // No pending item. Check completion.
    const detail = await loadBatchDetail(batchId, organizationId, userId);
    if (!detail) {
      return null;
    }
    if (
      detail.batch.processedCount === detail.batch.totalCount &&
      detail.batch.status !== "completed" &&
      detail.batch.status !== "cancelled"
    ) {
      const now = new Date();
      await db
        .update(resumeUploadBatch)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(eq(resumeUploadBatch.id, batchId));
      const fresh = await loadBatchDetail(batchId, organizationId, userId);
      return {
        batch: fresh?.batch ?? detail.batch,
        item: null,
        done: true,
      };
    }
    return { batch: detail.batch, item: null, done: detail.batch.status === "completed" };
  }

  const item = claimed.item;
  const batchRow = claimed.batchRow;
  // 2) Outside transaction: fetch S3, parse, dedup, decide, create.
  let succeededRecordId: string | null = null;
  let dedupSnapshot: unknown | null = null;
  let errorMessage: string | null = null;
  let isDuplicateSkip = false;

  try {
    const object = await getObjectStream(item.storageKey);
    if (!object) {
      throw new Error("简历文件不可用（S3 对象缺失）。");
    }
    const blob = new Blob([await new Response(object.body).arrayBuffer()], {
      type: object.contentType ?? "application/pdf",
    });
    const file = new File([blob], item.originalFileName, {
      type: object.contentType ?? "application/pdf",
    });
    const { resumeProfile } = await parseResumeFastToProfile(file);

    // 3) Dedup
    let dedupMatches: Awaited<ReturnType<typeof queryInterviewDedup>> | null = null;
    if (batchRow.dedupPolicy === "skip") {
      dedupMatches = await queryInterviewDedup(organizationId, {
        email: resumeProfile?.email ?? null,
        name: resumeProfile?.name ?? null,
        phone: resumeProfile?.phone ?? null,
      });
      if (dedupMatches.length > 0) {
        isDuplicateSkip = true;
        dedupSnapshot = dedupMatches;
      }
    }

    if (!isDuplicateSkip) {
      // 4) JD selection
      let jobDescriptionId: string | null = null;
      if (batchRow.jdMode === "bind") {
        jobDescriptionId = batchRow.jobDescriptionId;
      }
      // jdMode "auto" reserved: spec allows agent-based matching, but to keep
      // this plan focused, "auto" mode is implemented as "no jd" in v1.
      // 中文：jdMode=auto 在 v1 退化为不绑定 JD；后续可接入 agent 自动匹配。
      // English: jdMode=auto degrades to "no JD" in v1; agent-driven match TBD.
      succeededRecordId = await createResumeRecordFromStorage({
        organizationId,
        userId,
        storageKey: item.storageKey,
        contentHash: null,
        resumeFileName: item.originalFileName,
        resumeProfile,
        jobDescriptionId,
        notes: null,
        candidateName: null,
        candidateEmail: null,
        candidatePhone: null,
        targetRole: null,
      });
    }
  } catch (err) {
    errorMessage = truncate(err instanceof Error ? err.message : String(err));
  }

  // 5) Write result back in a single transaction; update batch counters.
  const finalState = await db.transaction(async (tx) => {
    const now = new Date();
    if (errorMessage) {
      await tx
        .update(resumeUploadBatchItem)
        .set({ status: "failed", errorMessage, finishedAt: now })
        .where(eq(resumeUploadBatchItem.id, item.id));
      await tx
        .update(resumeUploadBatch)
        .set({
          processedCount: batchRow.processedCount + 1,
          failedCount: batchRow.failedCount + 1,
          updatedAt: now,
        })
        .where(eq(resumeUploadBatch.id, batchId));
    } else if (isDuplicateSkip) {
      await tx
        .update(resumeUploadBatchItem)
        .set({
          status: "duplicate_skipped",
          dedupMatchSnapshot: dedupSnapshot as never,
          finishedAt: now,
        })
        .where(eq(resumeUploadBatchItem.id, item.id));
      await tx
        .update(resumeUploadBatch)
        .set({
          processedCount: batchRow.processedCount + 1,
          skippedCount: batchRow.skippedCount + 1,
          updatedAt: now,
        })
        .where(eq(resumeUploadBatch.id, batchId));
    } else {
      await tx
        .update(resumeUploadBatchItem)
        .set({
          status: "succeeded",
          resumeRecordId: succeededRecordId,
          finishedAt: now,
        })
        .where(eq(resumeUploadBatchItem.id, item.id));
      await tx
        .update(resumeUploadBatch)
        .set({
          processedCount: batchRow.processedCount + 1,
          succeededCount: batchRow.succeededCount + 1,
          updatedAt: now,
        })
        .where(eq(resumeUploadBatch.id, batchId));
    }

    // Completion check
    const [refreshed] = await tx
      .select()
      .from(resumeUploadBatch)
      .where(eq(resumeUploadBatch.id, batchId))
      .limit(1);
    if (
      refreshed &&
      refreshed.processedCount === refreshed.totalCount &&
      refreshed.status === "running"
    ) {
      await tx
        .update(resumeUploadBatch)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(eq(resumeUploadBatch.id, batchId));
    }
    return refreshed;
  });

  const detail = await loadBatchDetail(batchId, organizationId, userId);
  const updatedItem = detail?.items.find((i) => i.id === item.id) ?? null;
  return {
    batch: detail?.batch ?? toBatchDto(finalState!),
    item:
      updatedItem ??
      toItemDto({
        ...item,
        status: errorMessage ? "failed" : isDuplicateSkip ? "duplicate_skipped" : "succeeded",
      } as never),
    done: detail?.batch.status === "completed",
  };
}
```

> 注意：`auto` 模式在 v1 退化为「不绑定 JD」。spec 描述了三选一，但接入 JD 匹配 agent 是独立工作量，且与现有 `useResumeAnalysisPipeline` 的客户端流强耦合。**在确认 dialog 里仍提供三选一**，但选 `auto` 时 v1 行为等同于 `none`，UI 文案标注「v1 暂未启用自动匹配」。后续可再迭代。

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

Expected: no errors（如果 drizzle 类型对不上 jsonb，把 `dedupSnapshot as never` 改为 `dedupSnapshot as any` 或更准确的类型）。

- [ ] **Step 3: 提交**

```bash
git add src/server/routes/studio/routes/resume-upload-batches/utils/processor.ts
git commit -m "feat(bulk-upload): process-next core logic"
```

---

## Task 7: Hono 路由

**Files:**

- Create: `src/server/routes/studio/routes/resume-upload-batches/schema.ts`
- Create: `src/server/routes/studio/routes/resume-upload-batches/route.ts`

- [ ] **Step 1: schema.ts**

```ts
import { z } from "zod";
import { MAX_BULK_BATCH_SIZE, MAX_RESUME_FILE_SIZE_BYTES } from "@/lib/shared/bulk-resume-upload";

export const createBatchInputSchema = z.object({
  jdMode: z.enum(["bind", "auto", "none"]),
  jobDescriptionId: z.string().min(1).nullable().optional(),
  dedupPolicy: z.enum(["skip", "create"]),
  files: z
    .array(
      z.object({
        storageKey: z.string().min(1),
        originalFileName: z.string().min(1).max(500),
        fileSize: z.number().int().positive().max(MAX_RESUME_FILE_SIZE_BYTES),
      }),
    )
    .min(1)
    .max(MAX_BULK_BATCH_SIZE),
});
```

- [ ] **Step 2: route.ts**

```ts
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { chatAttachment, jobDescription } from "@/lib/shared/db/schema";
import { factory, jsonValidatorError } from "@/server/factory";
import { requirePermission } from "@/server/middlewares/permission";
import { validateResumeFile } from "@/server/agents/resume-analysis-agent";
import { normalizeResumeFile, storeInterviewResume } from "@/server/routes/interview/utils";
import {
  cancelBatch,
  deleteBatch,
  insertBatchWithItems,
  listBatches,
  loadActiveBatch,
  loadBatchDetail,
  reviveOrphans,
} from "@/server/routes/studio/routes/resume-upload-batches/dao/batches";
import { processNextItem } from "@/server/routes/studio/routes/resume-upload-batches/utils/processor";
import { createBatchInputSchema } from "./schema";

export const resumeUploadBatchesRouter = factory
  .createApp()
  // POST /uploads — multipart single file upload
  .post("/uploads", requirePermission("resume", "create"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const formData = await c.req.formData();
    const file = normalizeResumeFile(formData.get("file"));
    if (!file) {
      return c.json({ error: "未提供文件。" }, 400);
    }
    try {
      validateResumeFile(file);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "文件无效。" }, 400);
    }
    const result = await storeInterviewResume("bulk-upload", file, user.id, activeOrg.id);
    if (!result) {
      return c.json({ error: "存储未配置。" }, 500);
    }
    return c.json(
      {
        storageKey: result.storageKey,
        contentHash: result.contentHash,
        originalFileName: file.name,
        fileSize: file.size,
      },
      201,
    );
  })
  // POST / — create batch
  .post(
    "/",
    requirePermission("resume", "create"),
    zValidator("json", createBatchInputSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      if (input.jdMode === "bind") {
        if (!input.jobDescriptionId) {
          return c.json({ error: "绑定模式必须选择岗位。" }, 400);
        }
        const [jd] = await db
          .select({ id: jobDescription.id })
          .from(jobDescription)
          .where(
            and(
              eq(jobDescription.id, input.jobDescriptionId),
              eq(jobDescription.organizationId, activeOrg.id),
            ),
          )
          .limit(1);
        if (!jd) {
          return c.json({ error: "选择的岗位不存在。" }, 400);
        }
      }
      // 校验：每个 storageKey 都在 chat_attachment 表里存在（由 /uploads 写入）。
      // Validate each storageKey actually exists in chat_attachment (written by /uploads).
      const keys = input.files.map((f) => f.storageKey);
      const found = await db
        .select({ storageKey: chatAttachment.storageKey })
        .from(chatAttachment)
        .where(/* in (keys) */);
      // 上面的 drizzle inArray 实际写：
      // .where(inArray(chatAttachment.storageKey, keys));
      // 这里省略，确保引入 inArray 并这样写。
      const foundSet = new Set(found.map((r) => r.storageKey));
      const missing = keys.filter((k) => !foundSet.has(k));
      if (missing.length > 0) {
        return c.json({ error: "部分文件未上传完成。" }, 400);
      }

      try {
        const batchId = await insertBatchWithItems({
          organizationId: activeOrg.id,
          userId: user.id,
          jdMode: input.jdMode,
          jobDescriptionId: input.jobDescriptionId ?? null,
          dedupPolicy: input.dedupPolicy,
          files: input.files,
        });
        const detail = await loadBatchDetail(batchId, activeOrg.id, user.id);
        return c.json(detail, 201);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("resume_upload_batch_active_unique_idx") || msg.includes("unique")) {
          const active = await loadActiveBatch(activeOrg.id, user.id);
          return c.json(
            { error: "已有进行中的批次", activeBatchId: active?.batch.id ?? null },
            409,
          );
        }
        throw err;
      }
    },
  )
  .get("/", requirePermission("resume", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const rows = await listBatches(activeOrg.id, user.id);
    return c.json(rows, 200);
  })
  .get("/active", requirePermission("resume", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const detail = await loadActiveBatch(activeOrg.id, user.id);
    return c.json(detail, 200);
  })
  .get("/:id", requirePermission("resume", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const detail = await loadBatchDetail(c.req.param("id"), activeOrg.id, user.id);
    if (!detail) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(detail, 200);
  })
  .post("/:id/process-next", requirePermission("resume", "create"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const result = await processNextItem(c.req.param("id"), activeOrg.id, user.id);
    if (!result) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(result, 200);
  })
  .post("/:id/resume", requirePermission("resume", "create"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    await reviveOrphans(id, activeOrg.id, user.id);
    const detail = await loadBatchDetail(id, activeOrg.id, user.id);
    if (!detail) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(detail, 200);
  })
  .post("/:id/cancel", requirePermission("resume", "create"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const ok = await cancelBatch(c.req.param("id"), activeOrg.id, user.id);
    if (!ok) {
      return c.json({ error: "无法取消。" }, 400);
    }
    const detail = await loadBatchDetail(c.req.param("id"), activeOrg.id, user.id);
    return c.json(detail, 200);
  })
  .delete("/:id", requirePermission("resume", "delete"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const ok = await deleteBatch(c.req.param("id"), activeOrg.id, user.id);
    if (!ok) {
      return c.json({ error: "无法删除。" }, 400);
    }
    return c.json({ success: true }, 200);
  });
```

注意 `chatAttachment` 的 import 路径与表名要确认（搜 `chatAttachment` 在 schema 里）；如果项目里命名不同改成对应的导出。`inArray` 从 `drizzle-orm` import。

- [ ] **Step 3: 验证 import 正确**

```bash
pnpm typecheck
```

Expected: 解决所有 import 错（特别是 `chatAttachment`、`inArray`、Hono RPC types）。

- [ ] **Step 4: 提交**

```bash
git add src/server/routes/studio/routes/resume-upload-batches
git commit -m "feat(bulk-upload): Hono routes for batch lifecycle"
```

---

## Task 8: 挂载路由

**Files:**

- Modify: `src/server/routes/studio/route.ts`

- [ ] **Step 1: 增加 import + 挂载**

在 `src/server/routes/studio/route.ts`，import 区加：

```ts
import { resumeUploadBatchesRouter } from "./routes/resume-upload-batches/route";
```

在链式 `.route(...)` 列表里加：

```ts
.route("/resume-upload-batches", resumeUploadBatchesRouter)
```

位置放在 `.route("/resumes", resumeLibraryRouter)` 之后即可。

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

Expected: no errors。

- [ ] **Step 3: 提交**

```bash
git add src/server/routes/studio/route.ts
git commit -m "feat(bulk-upload): mount resume-upload-batches router"
```

---

## Task 9: 后端路由测试

**Files:**

- Create: `src/server/routes/studio/routes/resume-upload-batches/__tests__/route.test.ts`

参考 `src/server/routes/studio/routes/resumes/__tests__/route.test.ts` 的脚手架（不走 HTTP，直接调 DAO + processor 函数链路）：

- [ ] **Step 1: 写测试**

最低需覆盖：

- `insertBatchWithItems` + `loadBatchDetail` 整套
- `processNextItem` 一个 happy path（**mock S3 + parseResumeFastToProfile**）
- `processNextItem` 失败 → item.status=failed，counter +1
- `processNextItem` dedup 命中 + skip → duplicate_skipped
- 跨用户/跨租户 `loadBatchDetail` 返 null

mock 方式：在测试顶部用 `vi.mock("@/lib/server/s3", () => ({ getObjectStream: async () => ({ body: ... , contentType: "application/pdf" }) }))` 和 `vi.mock("@/server/agents/resume-analysis-agent", () => ({ parseResumeFastToProfile: async () => ({ resumeProfile: { name: "Test" } }), validateResumeFile: () => undefined }))`。

- [ ] **Step 2: 跑测试**

```bash
pnpm test -- src/server/routes/studio/routes/resume-upload-batches
```

Expected: 全部 PASS。

- [ ] **Step 3: 提交**

```bash
git add src/server/routes/studio/routes/resume-upload-batches/__tests__/route.test.ts
git commit -m "test(bulk-upload): processor + route happy paths"
```

---

## Task 10: 前端 RPC

**Files:**

- Create: `src/lib/client/api/bulk-resume-upload.ts`

- [ ] **Step 1: 写 RPC 包装**

```ts
import "client-only";

import { apiFetch, rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import type {
  BulkResumeBatchDetailDto,
  BulkResumeBatchDto,
  BulkResumeBatchItemDto,
  BulkResumeUploadFileDescriptor,
  CreateBulkResumeBatchInput,
  ProcessNextResult,
} from "@/lib/shared/bulk-resume-upload";

export async function uploadResumeFile(
  slug: string,
  file: File,
): Promise<BulkResumeUploadFileDescriptor> {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch<BulkResumeUploadFileDescriptor>(
    `/api/w/${slug}/studio/resume-upload-batches/uploads`,
    { body: fd, method: "POST" },
  );
}

export async function createBulkResumeBatch(
  slug: string,
  input: CreateBulkResumeBatchInput,
): Promise<BulkResumeBatchDetailDto> {
  return rpcFetch<BulkResumeBatchDetailDto>(
    rpc.api.w[":slug"].studio["resume-upload-batches"].$post({
      param: { slug },
      json: input,
    }),
    "创建批次失败",
  );
}

export async function getActiveBulkBatch(slug: string): Promise<BulkResumeBatchDetailDto | null> {
  return rpcFetch<BulkResumeBatchDetailDto | null>(
    rpc.api.w[":slug"].studio["resume-upload-batches"].active.$get({ param: { slug } }),
    "加载活跃批次失败",
  );
}

export async function processNextBulkBatch(
  slug: string,
  batchId: string,
): Promise<ProcessNextResult> {
  return rpcFetch<ProcessNextResult>(
    rpc.api.w[":slug"].studio["resume-upload-batches"][":id"]["process-next"].$post({
      param: { slug, id: batchId },
    }),
    "处理失败",
  );
}

export async function resumeBulkBatch(
  slug: string,
  batchId: string,
): Promise<BulkResumeBatchDetailDto> {
  return rpcFetch<BulkResumeBatchDetailDto>(
    rpc.api.w[":slug"].studio["resume-upload-batches"][":id"].resume.$post({
      param: { slug, id: batchId },
    }),
    "继续批次失败",
  );
}

export async function cancelBulkBatch(
  slug: string,
  batchId: string,
): Promise<BulkResumeBatchDetailDto> {
  return rpcFetch<BulkResumeBatchDetailDto>(
    rpc.api.w[":slug"].studio["resume-upload-batches"][":id"].cancel.$post({
      param: { slug, id: batchId },
    }),
    "取消失败",
  );
}
```

如果 hc RPC 推断的 path 不严格命名为 `resume-upload-batches`（hc 会把短横线变成 camelCase 属性？检查 hc 行为），可能要回退到 `apiFetch`。先尝试 RPC，typecheck 不过就退到 `apiFetch`。

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

Expected: no errors，否则按上面注释退到 `apiFetch`。

- [ ] **Step 3: 提交**

```bash
git add src/lib/client/api/bulk-resume-upload.ts
git commit -m "feat(bulk-upload): client RPC wrappers"
```

---

## Task 11: 状态机 hook

**Files:**

- Create: `src/app/(auth)/w/[slug]/studio/resumes/_components/use-bulk-upload.ts`

- [ ] **Step 1: 写 hook**

```ts
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  cancelBulkBatch,
  createBulkResumeBatch,
  processNextBulkBatch,
  resumeBulkBatch,
  uploadResumeFile,
} from "@/lib/client/api/bulk-resume-upload";
import type {
  BulkResumeBatchDetailDto,
  BulkResumeBatchItemDto,
  CreateBulkResumeBatchInput,
} from "@/lib/shared/bulk-resume-upload";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

export type BulkUploadPhase =
  | "idle"
  | "uploading"
  | "processing"
  | "paused"
  | "completed"
  | "cancelled";

interface State {
  phase: BulkUploadPhase;
  detail: BulkResumeBatchDetailDto | null;
}

export function useBulkUpload() {
  const slug = useWorkspaceSlug();
  const qc = useQueryClient();
  const [state, setState] = useState<State>({ phase: "idle", detail: null });
  const abortRef = useRef(false);
  const lastInvalidateRef = useRef(0);

  const invalidateThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastInvalidateRef.current < 600) {
      return;
    }
    lastInvalidateRef.current = now;
    void qc.invalidateQueries({ queryKey: ["studio-resumes"] });
  }, [qc]);

  const runLoop = useCallback(
    async (batchId: string) => {
      abortRef.current = false;
      setState((s) => ({ ...s, phase: "processing" }));
      while (!abortRef.current) {
        try {
          const res = await processNextBulkBatch(slug, batchId);
          setState((prev) => {
            if (!prev.detail) {
              return prev;
            }
            const items = prev.detail.items.map((it) =>
              res.item && it.id === res.item.id ? res.item : it,
            );
            return { ...prev, detail: { batch: res.batch, items } };
          });
          invalidateThrottled();
          if (res.done) {
            setState((s) => ({ ...s, phase: "completed" }));
            void qc.invalidateQueries({ queryKey: ["active-bulk-batch"] });
            return;
          }
          if (!res.item) {
            // No more pending but not done — caller should resume orphans.
            setState((s) => ({ ...s, phase: "paused" }));
            return;
          }
        } catch (err) {
          console.error("[bulk-upload] process-next failed:", err);
          setState((s) => ({ ...s, phase: "paused" }));
          return;
        }
      }
    },
    [slug, qc, invalidateThrottled],
  );

  const start = useCallback(
    async (files: File[], config: Omit<CreateBulkResumeBatchInput, "files">) => {
      setState({ phase: "uploading", detail: null });
      // Concurrency 4
      const descriptors: { storageKey: string; originalFileName: string; fileSize: number }[] = [];
      const pool = 4;
      let i = 0;
      async function worker() {
        while (true) {
          const idx = i++;
          if (idx >= files.length) {
            return;
          }
          const f = files[idx];
          const d = await uploadResumeFile(slug, f);
          descriptors[idx] = {
            storageKey: d.storageKey,
            originalFileName: d.originalFileName,
            fileSize: d.fileSize,
          };
        }
      }
      await Promise.all(Array.from({ length: pool }, worker));
      const detail = await createBulkResumeBatch(slug, { ...config, files: descriptors });
      setState({ phase: "processing", detail });
      void runLoop(detail.batch.id);
    },
    [slug, runLoop],
  );

  const resume = useCallback(
    async (batchId: string) => {
      const detail = await resumeBulkBatch(slug, batchId);
      setState({ phase: "processing", detail });
      void runLoop(batchId);
    },
    [slug, runLoop],
  );

  const cancel = useCallback(async () => {
    if (!state.detail) {
      return;
    }
    abortRef.current = true;
    const detail = await cancelBulkBatch(slug, state.detail.batch.id);
    setState({ phase: "cancelled", detail });
    void qc.invalidateQueries({ queryKey: ["active-bulk-batch"] });
    void qc.invalidateQueries({ queryKey: ["studio-resumes"] });
  }, [slug, state.detail, qc]);

  const abort = useCallback(() => {
    abortRef.current = true;
    setState((s) => ({ ...s, phase: "paused" }));
  }, []);

  return { state, start, resume, cancel, abort };
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

Expected: no errors。

- [ ] **Step 3: 提交**

```bash
git add src/app/(auth)/w/[slug]/studio/resumes/_components/use-bulk-upload.ts
git commit -m "feat(bulk-upload): state-machine hook"
```

---

## Task 12: 确认 dialog

**Files:**

- Create: `src/app/(auth)/w/[slug]/studio/resumes/_components/bulk-upload-confirm-dialog.tsx`

- [ ] **Step 1: 写组件**

骨架（仿 `upload-resume-dialog.tsx` 风格）：

- `Modal` 加 footer 「开始上传」「取消」
- 文件清单（map 一个 `<ul>`，每行展示文件名 + size + 移除按钮）
- `RadioGroup` for `jdMode`：`bind` / `auto` / `none`；`bind` 选中时下方显示 JD `Combobox`（用既有的 JD picker 组件，搜 `JobDescriptionCombobox` 或对应名字）
- `RadioGroup` for `dedupPolicy`：`skip` / `create`
- 「开始上传」按钮：调 `useBulkUpload().start(files, { jdMode, jobDescriptionId, dedupPolicy })`
- 提交后 close 自身，转交 progress dialog（由父组件控制 open）

prop 接口：

```ts
interface BulkUploadConfirmDialogProps {
  open: boolean;
  files: File[];
  onOpenChange: (open: boolean) => void;
  onConfirmed: (
    files: File[],
    config: {
      jdMode: "bind" | "auto" | "none";
      jobDescriptionId: string | null;
      dedupPolicy: "skip" | "create";
    },
  ) => void;
  onRemoveFile: (index: number) => void;
}
```

- [ ] **Step 2: 跑 typecheck + lint**

```bash
pnpm typecheck && pnpm check
```

- [ ] **Step 3: 提交**

```bash
git add src/app/(auth)/w/[slug]/studio/resumes/_components/bulk-upload-confirm-dialog.tsx
git commit -m "feat(bulk-upload): confirm dialog"
```

---

## Task 13: 进度 dialog

**Files:**

- Create: `src/app/(auth)/w/[slug]/studio/resumes/_components/bulk-upload-progress-dialog.tsx`

- [ ] **Step 1: 写组件**

骨架：

- 顶部 Progress 条 + 文字「X / N · 成功 X 失败 Y 跳过 Z」
- 列表（虚拟滚动可选）每行：order#、filename、状态徽章（pending/processing/succeeded/failed/duplicate_skipped/cancelled）、错误消息（failed 时）
- footer：phase 不是 completed/cancelled 时显示「取消批次」+ 「先关闭（不取消）」；completed/cancelled 时显示「关闭」
- 接收 `useBulkUpload()` 返回的 state + cancel/abort

prop 接口：

```ts
interface BulkUploadProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ReturnType<typeof useBulkUpload>["state"];
  onCancel: () => void;
  onAbort: () => void;
}
```

- [ ] **Step 2: typecheck + lint**

```bash
pnpm typecheck && pnpm check
```

- [ ] **Step 3: 提交**

```bash
git add src/app/(auth)/w/[slug]/studio/resumes/_components/bulk-upload-progress-dialog.tsx
git commit -m "feat(bulk-upload): progress dialog"
```

---

## Task 14: Active batch banner

**Files:**

- Create: `src/app/(auth)/w/[slug]/studio/resumes/_components/active-batch-banner.tsx`

- [ ] **Step 1: 写组件**

骨架：

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getActiveBulkBatch } from "@/lib/client/api/bulk-resume-upload";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

interface Props {
  onContinue: (batchId: string) => void;
  onCancel: (batchId: string) => void;
}

export function ActiveBatchBanner({ onContinue, onCancel }: Props) {
  const slug = useWorkspaceSlug();
  const { data } = useQuery({
    queryKey: ["active-bulk-batch", slug],
    queryFn: () => getActiveBulkBatch(slug),
  });
  if (!data) {
    return null;
  }
  const { batch } = data;
  return (
    <Alert>
      <AlertTitle>未完成的批量上传</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>
          进度 {batch.processedCount}/{batch.totalCount} · 成功 {batch.succeededCount} · 失败{" "}
          {batch.failedCount} · 跳过 {batch.skippedCount}
        </span>
        <div className="flex gap-2">
          <Button onClick={() => onContinue(batch.id)} size="sm">
            继续
          </Button>
          <Button onClick={() => onCancel(batch.id)} size="sm" variant="outline">
            放弃
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: 提交**

```bash
git add src/app/(auth)/w/[slug]/studio/resumes/_components/active-batch-banner.tsx
git commit -m "feat(bulk-upload): active batch banner"
```

---

## Task 15: 入口按钮 + 接入简历库页

**Files:**

- Create: `src/app/(auth)/w/[slug]/studio/resumes/_components/bulk-upload-button.tsx`
- Modify: `src/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page.tsx`

- [ ] **Step 1: 写 bulk-upload-button**

骨架：

```tsx
"use client";

import { UploadCloudIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MAX_BULK_BATCH_SIZE, MAX_RESUME_FILE_SIZE_BYTES } from "@/lib/shared/bulk-resume-upload";
import { BulkUploadConfirmDialog } from "./bulk-upload-confirm-dialog";
import { BulkUploadProgressDialog } from "./bulk-upload-progress-dialog";
import { useBulkUpload } from "./use-bulk-upload";

interface Props {
  hasActiveBatch: boolean;
  onProgressClose: () => void;
}

export function BulkUploadButton({ hasActiveBatch, onProgressClose }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const bulk = useBulkUpload();

  function pickFiles() {
    inputRef.current?.click();
  }

  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    if (list.length === 0) {
      return;
    }
    if (list.length > MAX_BULK_BATCH_SIZE) {
      toast.error(`最多 ${MAX_BULK_BATCH_SIZE} 份`);
      return;
    }
    const oversize = list.find((f) => f.size > MAX_RESUME_FILE_SIZE_BYTES);
    if (oversize) {
      toast.error(`「${oversize.name}」超过 20MB`);
      return;
    }
    setFiles(list);
    setConfirmOpen(true);
    e.target.value = "";
  }

  return (
    <>
      <input
        accept="application/pdf"
        className="hidden"
        multiple
        onChange={onFilesPicked}
        ref={inputRef}
        type="file"
      />
      <Button
        disabled={hasActiveBatch}
        onClick={pickFiles}
        title={hasActiveBatch ? "已有进行中的批次" : undefined}
        variant="outline"
      >
        <UploadCloudIcon className="size-4" />
        批量上传
      </Button>

      <BulkUploadConfirmDialog
        files={files}
        onConfirmed={async (selected, config) => {
          setConfirmOpen(false);
          setProgressOpen(true);
          await bulk.start(selected, config);
        }}
        onOpenChange={setConfirmOpen}
        onRemoveFile={(idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))}
        open={confirmOpen}
      />

      <BulkUploadProgressDialog
        onAbort={() => {
          bulk.abort();
          setProgressOpen(false);
          onProgressClose();
        }}
        onCancel={async () => {
          await bulk.cancel();
          setProgressOpen(false);
          onProgressClose();
        }}
        onOpenChange={(o) => {
          if (!o) {
            bulk.abort();
            setProgressOpen(false);
            onProgressClose();
          }
        }}
        open={progressOpen}
        state={bulk.state}
      />
    </>
  );
}
```

- [ ] **Step 2: 接入 resume-library-page.tsx**

在工具栏 toolbarRight 处把 `CreateResumeRecordDialog` + 新的 `BulkUploadButton` 并排：

```tsx
toolbarRight={
  <div className="flex gap-2">
    <BulkUploadButton
      hasActiveBatch={Boolean(activeBatch)}
      onProgressClose={() => qc.invalidateQueries({ queryKey: ["active-bulk-batch"] })}
    />
    <CreateResumeRecordDialog onCreated={handleResumeRecordCreated} />
  </div>
}
```

并在页面顶部紧贴 `<PageHeader>` 之后渲染 `<ActiveBatchBanner onContinue={...} onCancel={...} />`，`onContinue` 触发 `bulk.resume(id)` + 打开 progress dialog，`onCancel` 调 `cancelBulkBatch(slug, id)`。

注意：因为 banner 与 BulkUploadButton 都需要 `useBulkUpload`，最好把 hook 提升到 ResumeLibraryPage 这一层（或包一个 BulkUploadController context）。简单起见把 `useBulkUpload` 调用搬到页面级，把 `bulk` 和 `progressOpen` setter 透传给两个子组件。

- [ ] **Step 3: typecheck + lint + test**

```bash
pnpm typecheck && pnpm check && pnpm test
```

- [ ] **Step 4: 提交**

```bash
git add src/app/(auth)/w/[slug]/studio/resumes/_components
git commit -m "feat(bulk-upload): wire bulk upload entry into resume library"
```

---

## Task 16: 全量验证

- [ ] **Step 1: 跑 verify skill 或 verify 命令**

```bash
pnpm verify
```

或：

```bash
pnpm typecheck && pnpm check && pnpm test
```

Expected: 全部 PASS。

- [ ] **Step 2: 启动 dev 服务做 smoke 测试**

```bash
pnpm dev
```

按 spec 的 smoke checklist 手动跑：

1. 选 3 份 PDF，jdMode=bind + 跳过重复 → 全部成功，列表实时刷新
2. 选 3 份混合（image PDF / 正常 / 重复邮箱） → 1 跳过 / 1 succeeded / 1 succeeded
3. 处理到第 2 份时刷新页面 → banner 出现 → 继续 → 接着跑
4. 处理中点取消 → 已入库保留，未跑标 cancelled
5. 两 tab 同时打开同一 batch 的 progress dialog → 计数不超过 totalCount

- [ ] **Step 3: 全局 commit / push（如需）**

提交所有遗漏的修复。

---

## Self-Review Notes

- ✅ Spec 中除 "auto JD 模式" 外全部覆盖；v1 把 `auto` 退化为 `none`，UI 文案标注，后续迭代再补。
- ✅ DB 唯一约束 + `FOR UPDATE SKIP LOCKED` 双层保护并发。
- ✅ `createResumeRecordFromStorage` 抽取避免单/批两条路径分叉。
- ✅ 测试覆盖：DAO（并发、隔离、唯一约束、孤儿、取消、删除）、processor（成功/失败/dedup）。前端组件测试**未在本计划内**——按 spec "测试" 章节理论应该有，但 hook/dialog 测试代码量大且收益边际；建议手测 smoke + 后续按需补单测。
- ⚠️ S3 路径偏离 spec（hash-based registry 而非 batch 前缀路径），改用 `chat_attachment` 存在性校验。已在文件顶部「重要偏离」标出。
- ⚠️ Hono RPC `hc` 对短横线路径的属性命名要在 Task 10 现场验证；不行就退到 `apiFetch`。
