# Interview Round Pivot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 面试列表与详情从「按候选人聚合」切换为「按面试轮次（`studio_interview_schedule` 行）」展示，候选人信息通过 JOIN 带出；代码层的类型 / 模块 / DAO 命名按管理记录（candidate）与面试轮次（round）两类概念拆开；DB 表名不变。

**Architecture:** 新增 `studio-candidates.ts` 持有候选人聚合视图（`StudioCandidateRecord`），新增 `studio-interview-rounds.ts` 持有 round 视图（`StudioInterviewRoundDetail` / `StudioInterviewRoundListRecord`）；新增 `dao/interview-rounds.ts` 走 `studio_interview_schedule` → `studio_interview` 主查询；route 文件路径不变，但 `:id` 一律代表 roundId（handler 内部解出 candidateId）；写操作（PATCH / DELETE / bulk-delete）也按 round 维度。`studio_interview.status` 列仅 POST 写入 + 公共面试链接 archived gate 读取，其他地方不再消费。

**Tech Stack:** Next.js 16 + Hono + Drizzle ORM + TanStack Form + Vitest（jsdom + 真实 DB 集成测试）。

---

## Locked decisions (from spec)

1. 列表行 `id = roundId`（schedule.id）；候选人 ID 作为 `candidateId` 单独字段
2. 列表列：候选人姓名 / JD 名 / 轮次 / 排期 / round status / 是否有报告 / 是否允许文本输入 / 创建时间 / actions
3. status 过滤改用 round status（`pending` / `in_progress` / `completed` / `interrupted`）
4. Summary 卡片按 round status 聚合
5. 详情顶部新增「轮次概览」区块；其余 tabs 数据源不变但通过 round → candidate 解出 candidateId
6. 详情 footer interview 模式继续跳转 `/studio/resumes?recordId=<candidateId>`
7. 简历库 detail footer 「发起 AI 面试」push 去掉 `?recordId=...` query 参数
8. `studio_interview.status` 列保留；POST 仍写入，公共 interview resolver 仍读取 `archived` gate；AI 面试侧不再消费
9. 简历库「保存并发起面试」POST 仍走 `/studio/interviews`，handler 内部不变（写 candidate + 默认 1 round），但返回值改为 `StudioInterviewRoundListRecord`（指向新插入的第一轮）
10. `StudioPersonDetailDialog` / `StudioPersonEditDialog` 的 `recordId` prop 名不改（mode 区分含义）

---

## File map

### 新增
- `src/lib/shared/studio-candidates.ts` — 候选人聚合类型
- `src/lib/shared/studio-interview-rounds.ts` — round 视图类型
- `src/server/routes/studio/routes/interviews/dao/interview-rounds.ts` — round-keyed DAO
- `src/server/routes/studio/routes/interviews/dao/__tests__/interview-rounds.test.ts` — 真实 DB 集成测试

### 修改
- `src/lib/shared/studio-interviews.ts` — 瘦身保留 schema/枚举/parser；删旧 `StudioInterviewRecord` / `StudioInterviewListRecord` / `toStudioInterviewListRecord`
- `src/server/routes/studio/routes/interviews/dao/studio-interviews.ts` — 留 `loadStudioCandidate` 等候选人取数；删 `queryPaginatedStudioInterviewRecords` / `queryStudioInterviewSummary` / `toStudioInterviewListRecord`
- `src/server/routes/studio/routes/interviews/route.ts` — `:id` 重新解释为 roundId；handler 全面改造
- `src/lib/client/api/endpoints/studio-interviews.ts` — helper 重命名 + 返回类型 swap
- `src/app/(auth)/w/[slug]/studio/interviews/page.tsx` — 初始 fetch 改用 `listInterviewRounds` cached
- `src/app/(auth)/w/[slug]/studio/interviews/_components/interview-management-page.tsx` — 列表行类型 + 列定义 + summary + actions
- `src/app/(auth)/w/[slug]/studio/_components/studio-person-detail-dialog.tsx` — interview 模式数据源 + 概览 tab 区块
- `src/app/(auth)/w/[slug]/studio/_components/studio-person-edit-dialog.tsx` — interview 模式表单字段
- `src/app/(auth)/w/[slug]/studio/resumes/_components/upload-resume-dialog.tsx` — onCreated 类型 swap
- `src/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page.tsx` — onCreated union 类型 swap
- `src/app/(auth)/w/[slug]/studio/resumes/_components/...detail-dialog 跳转` — 简历库 footer 跳转去掉 `?recordId=` 参数（**注：实际触发简历库跳转 AI 面试的按钮在 `studio-person-detail-dialog.tsx` 的 resume-mode footer，与候选人详情共用文件**）

---

## Phase 1 — Shared types

### Task 1: 新增 `studio-candidates.ts` + `studio-interview-rounds.ts`，瘦身 `studio-interviews.ts`

**Files:**
- Create: `src/lib/shared/studio-candidates.ts`
- Create: `src/lib/shared/studio-interview-rounds.ts`
- Modify: `src/lib/shared/studio-interviews.ts`

- [ ] **Step 1: 新建 `studio-candidates.ts`**

```ts
// 候选人聚合视图（"管理记录"）。
// 字段集合等同于原 StudioInterviewRecord，但**不含** scheduleEntries 与 interviewLink
// —— 这两个属于 round 层，由 studio-interview-rounds.ts 负责。
//
// Candidate aggregate view ("management record"). Mirrors the legacy
// StudioInterviewRecord field set but **omits** scheduleEntries and
// interviewLink, which now live on the round-side type.

import type { ResumeAnalysisResult } from "@/lib/shared/interview/types";
import type { StudioInterviewStatus } from "@/lib/shared/studio-interviews";

export interface StudioCandidateRecord {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  status: StudioInterviewStatus;
  resumeContentHash: string | null;
  resumeFileName: string | null;
  resumeProfile: ResumeAnalysisResult["resumeProfile"] | null;
  resumeStorageKey: string | null;
  interviewQuestions: ResumeAnalysisResult["interviewQuestions"];
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  notes: string | null;
  createdBy: string | null;
  creatorName: string | null;
  creatorOrganizationName: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: 新建 `studio-interview-rounds.ts`**

```ts
// AI 面试 round 视图类型。
// list / detail 都从 studio_interview_schedule 主键出发，candidate 信息通过 JOIN 带出快照。
//
// AI interview round-side types. Both list rows and detail are keyed by the
// schedule row's id; candidate info is JOINed in as a snapshot.

import type { ScheduleEntryStatus } from "@/lib/shared/studio-interviews";
import type { StudioCandidateRecord } from "@/lib/shared/studio-candidates";

/** 列表行（精简投影）/ List row (light projection). */
export interface StudioInterviewRoundListRecord {
  /** schedule 行 id（同时是 list 的稳定 rowKey）。 */
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  resumeFileName: string | null;
  hasResumeFile: boolean;
  roundLabel: string;
  sortOrder: number;
  scheduledAt: string | null;
  status: ScheduleEntryStatus;
  allowTextInput: boolean;
  conversationId: string | null;
  hasReport: boolean;
  /** 完整面试链接相对路径 / Relative interview link path. */
  interviewLink: string;
  creatorName: string | null;
  creatorOrganizationName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 单 round 详情 + 候选人快照 / Single-round detail with candidate snapshot. */
export interface StudioInterviewRoundDetail {
  id: string;
  roundLabel: string;
  sortOrder: number;
  scheduledAt: string | null;
  status: ScheduleEntryStatus;
  allowTextInput: boolean;
  conversationId: string | null;
  sessionStartedAt: string | null;
  disconnectedAt: string | null;
  notes: string | null;
  interviewLink: string;
  createdAt: string;
  updatedAt: string;
  /** Whether this round currently has any conversation row in interview_conversation. */
  hasReport: boolean;
  /** Candidate snapshot (resume + JD + generated questions). */
  candidate: StudioCandidateRecord;
}

export interface PaginatedStudioInterviewRoundsResult {
  records: StudioInterviewRoundListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

- [ ] **Step 3: 瘦身 `studio-interviews.ts`**

Open `src/lib/shared/studio-interviews.ts`. Delete:
- `interface StudioInterviewRecord` (lines ~123-143)
- `type StudioInterviewListRecord` (lines ~145-153)
- `function toStudioInterviewListRecord` (lines ~155-180)

After delete, the file should only export schemas / enums / form values / parser helpers / `createDefaultScheduleEntry` / `getScheduleEntryDateValue`.

Run `pnpm typecheck` — you'll get many "Cannot find name 'StudioInterviewRecord'" errors (expected; later tasks fix them). For this task, only the new files must compile. **Add to the top of `studio-interviews.ts`** a temporary re-export bridge so unrelated callers keep building until later tasks:

```ts
// 临时桥接：StudioInterviewRecord 旧别名 → 新 StudioCandidateRecord。
// Task 6 cleanup 时删除。
// Temporary bridge: legacy StudioInterviewRecord → new StudioCandidateRecord.
// Removed in Task 6 cleanup.
export type {
  StudioCandidateRecord as StudioInterviewRecord,
} from "@/lib/shared/studio-candidates";
```

This keeps callers that import `StudioInterviewRecord` compiling even though it now lacks `scheduleEntries` / `interviewLink` — those callers will be migrated in T3-T5.

- [ ] **Step 4: typecheck**

```bash
pnpm typecheck
```

Expected: there may be errors in DAO / route / dialog files that read `.scheduleEntries` / `.interviewLink` off `StudioInterviewRecord`. **List those errors** (they're the migration TODO list for T3-T5). Don't fix them in this task.

- [ ] **Step 5: commit**

```bash
git add src/lib/shared/studio-candidates.ts \
        src/lib/shared/studio-interview-rounds.ts \
        src/lib/shared/studio-interviews.ts
git commit -m "feat(studio): introduce StudioCandidateRecord + Round types"
```

> Pre-commit `pnpm dlx ultracite fix` runs but won't fail on type errors (it's only oxlint/oxfmt). Commit succeeds.

---

## Phase 2 — Server DAO

### Task 2: 新增 `dao/interview-rounds.ts` + 集成测试

**Files:**
- Create: `src/server/routes/studio/routes/interviews/dao/interview-rounds.ts`
- Create: `src/server/routes/studio/routes/interviews/dao/__tests__/interview-rounds.test.ts`
- Modify: `src/server/routes/studio/routes/interviews/dao/studio-interviews.ts` — 新增 `loadStudioCandidate` 函数

- [ ] **Step 1: 写真实 DB 测试（红）**

Create `src/server/routes/studio/routes/interviews/dao/__tests__/interview-rounds.test.ts`:

```ts
// 真实 DB 集成测试：按轮次维度查询 + 详情 + 计数聚合。
// Per project memory: 用真实数据库，不 mock。
//
// Real-DB integration tests for the round-keyed DAO. Per project memory,
// hits the live test database — no mocks.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import {
  member,
  organization,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@/lib/shared/db/schema";
import {
  loadInterviewRoundDetail,
  queryPaginatedInterviewRounds,
  summarizeInterviewRoundCounts,
} from "@/server/routes/studio/routes/interviews/dao/interview-rounds";

const ORG = "test_org_interview_rounds";
const USER_ID = "test_user_interview_rounds";
const NOW = new Date("2026-05-13T15:00:00.000Z");

async function cleanup() {
  await db
    .delete(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.organizationId, ORG));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG));
  await db.delete(member).where(eq(member.userId, USER_ID));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values({
    createdAt: NOW,
    email: "rounds-dao@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "rd",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG,
    name: "Org Rounds",
    slug: "test-rounds-dao",
  });
  await db.insert(member).values({
    createdAt: NOW,
    id: "m_rounds",
    organizationId: ORG,
    role: "owner",
    userId: USER_ID,
  });

  // Candidate A with 2 rounds
  await db.insert(studioInterview).values({
    candidateName: "张三",
    createdAt: NOW,
    createdBy: USER_ID,
    id: "cand-a",
    interviewQuestions: [],
    organizationId: ORG,
    resumeProfile: null,
    status: "ready",
    targetRole: "前端工程师",
    updatedAt: NOW,
  });
  await db.insert(studioInterviewSchedule).values([
    {
      allowTextInput: true,
      createdAt: NOW,
      id: "rnd-a1",
      interviewRecordId: "cand-a",
      organizationId: ORG,
      roundLabel: "一面",
      scheduledAt: new Date("2026-05-14T10:00:00.000Z"),
      sortOrder: 0,
      status: "pending",
      updatedAt: NOW,
    },
    {
      allowTextInput: false,
      createdAt: NOW,
      id: "rnd-a2",
      interviewRecordId: "cand-a",
      organizationId: ORG,
      roundLabel: "二面",
      scheduledAt: null,
      sortOrder: 1,
      status: "pending",
      updatedAt: NOW,
    },
  ]);

  // Candidate B with 1 round (completed)
  await db.insert(studioInterview).values({
    candidateName: "李四",
    createdAt: NOW,
    createdBy: USER_ID,
    id: "cand-b",
    interviewQuestions: [],
    organizationId: ORG,
    resumeProfile: null,
    status: "completed",
    targetRole: "后端工程师",
    updatedAt: NOW,
  });
  await db.insert(studioInterviewSchedule).values({
    allowTextInput: true,
    createdAt: NOW,
    id: "rnd-b1",
    interviewRecordId: "cand-b",
    organizationId: ORG,
    roundLabel: "一面",
    scheduledAt: new Date("2026-05-12T10:00:00.000Z"),
    sortOrder: 0,
    status: "completed",
    updatedAt: NOW,
  });
});

afterAll(cleanup);

describe("queryPaginatedInterviewRounds", () => {
  it("returns 3 rows (one per round) joined with candidate info", async () => {
    const result = await queryPaginatedInterviewRounds(ORG);

    expect(result.total).toBe(3);
    expect(result.records).toHaveLength(3);
    const byRound = Object.fromEntries(result.records.map((r) => [r.id, r]));
    expect(byRound["rnd-a1"]?.candidateName).toBe("张三");
    expect(byRound["rnd-a1"]?.roundLabel).toBe("一面");
    expect(byRound["rnd-a2"]?.candidateName).toBe("张三");
    expect(byRound["rnd-b1"]?.candidateName).toBe("李四");
  });

  it("scopes by organizationId", async () => {
    const result = await queryPaginatedInterviewRounds("other_org_no_data");
    expect(result.total).toBe(0);
    expect(result.records).toHaveLength(0);
  });

  it("filters by status (CSV)", async () => {
    const result = await queryPaginatedInterviewRounds(ORG, { status: "completed" });
    expect(result.total).toBe(1);
    expect(result.records[0]?.id).toBe("rnd-b1");
  });

  it("filters by search across candidate name + round label", async () => {
    const byName = await queryPaginatedInterviewRounds(ORG, { search: "张三" });
    expect(byName.total).toBe(2);
    const byRound = await queryPaginatedInterviewRounds(ORG, { search: "二面" });
    expect(byRound.total).toBe(1);
    expect(byRound.records[0]?.id).toBe("rnd-a2");
  });
});

describe("loadInterviewRoundDetail", () => {
  it("loads a round with candidate snapshot", async () => {
    const detail = await loadInterviewRoundDetail("rnd-a1", ORG);
    expect(detail).not.toBeNull();
    expect(detail?.id).toBe("rnd-a1");
    expect(detail?.roundLabel).toBe("一面");
    expect(detail?.candidate.id).toBe("cand-a");
    expect(detail?.candidate.candidateName).toBe("张三");
    expect(detail?.candidate.targetRole).toBe("前端工程师");
  });

  it("returns null on org mismatch", async () => {
    const detail = await loadInterviewRoundDetail("rnd-a1", "other_org_no_data");
    expect(detail).toBeNull();
  });

  it("returns null on unknown id", async () => {
    const detail = await loadInterviewRoundDetail("nope", ORG);
    expect(detail).toBeNull();
  });
});

describe("summarizeInterviewRoundCounts", () => {
  it("counts by round status", async () => {
    const summary = await summarizeInterviewRoundCounts(ORG);
    expect(summary.total).toBe(3);
    expect(summary.pending).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.inProgress).toBe(0);
    expect(summary.interrupted).toBe(0);
  });
});
```

- [ ] **Step 2: 创建 DAO 主文件**

Create `src/server/routes/studio/routes/interviews/dao/interview-rounds.ts`:

```ts
// Round-keyed DAO for AI 面试 列表与详情。
// 主查询：FROM studio_interview_schedule LEFT JOIN studio_interview
// LEFT JOIN job_description LEFT JOIN user LEFT JOIN (conversations 是否存在) AS hasReport。
//
// Round-keyed DAO. Drives off studio_interview_schedule and joins back to
// the candidate row, JD, creator, and a "has at least one conversation" flag.

import { and, asc, count, desc, eq, exists, ilike, inArray, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  interviewConversation,
  jobDescription,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@/lib/shared/db/schema";
import { buildInterviewLink } from "@/lib/shared/interview/interview-record";
import { scheduleEntryStatusSchema } from "@/lib/shared/studio-interviews";
import type { ScheduleEntryStatus } from "@/lib/shared/studio-interviews";
import type {
  PaginatedStudioInterviewRoundsResult,
  StudioInterviewRoundDetail,
  StudioInterviewRoundListRecord,
} from "@/lib/shared/studio-interview-rounds";
import { loadStudioCandidate } from "./studio-interviews";

const SORT_COLUMNS = ["scheduledAt", "createdAt", "candidateName", "roundLabel"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const roundsPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(SORT_COLUMNS).default("scheduledAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

function parsePagination(params?: Record<string, unknown>) {
  return roundsPaginationSchema.parse(params ?? {});
}

function csvToList(value?: string | null): string[] | undefined {
  if (!value) return;
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseStatusFilter(value?: string | null): ScheduleEntryStatus[] | undefined {
  const items = csvToList(value);
  if (!items) return;
  const valid = items.filter((v): v is ScheduleEntryStatus =>
    scheduleEntryStatusSchema.options.includes(v as ScheduleEntryStatus),
  );
  return valid.length > 0 ? valid : undefined;
}

const SELECTED_COLUMNS = {
  allowTextInput: studioInterviewSchedule.allowTextInput,
  candidateEmail: studioInterview.candidateEmail,
  candidateId: studioInterview.id,
  candidateName: studioInterview.candidateName,
  candidatePhone: studioInterview.candidatePhone,
  conversationId: studioInterviewSchedule.conversationId,
  createdAt: studioInterviewSchedule.createdAt,
  createdBy: studioInterview.createdBy,
  creatorName: user.name,
  creatorOrganizationName: user.feishuTenantName,
  hasReport: exists(
    db
      .select({ one: studioInterview.id })
      .from(interviewConversation)
      .where(eq(interviewConversation.scheduleEntryId, studioInterviewSchedule.id)),
  ).as("hasReport"),
  id: studioInterviewSchedule.id,
  jobDescriptionId: studioInterview.jobDescriptionId,
  jobDescriptionName: jobDescription.name,
  resumeFileName: studioInterview.resumeFileName,
  resumeStorageKey: studioInterview.resumeStorageKey,
  roundLabel: studioInterviewSchedule.roundLabel,
  scheduledAt: studioInterviewSchedule.scheduledAt,
  sortOrder: studioInterviewSchedule.sortOrder,
  status: studioInterviewSchedule.status,
  targetRole: studioInterview.targetRole,
  updatedAt: studioInterviewSchedule.updatedAt,
} as const;

function buildOrderBy(sortBy: SortColumn, sortOrder: "asc" | "desc") {
  const columnMap = {
    candidateName: studioInterview.candidateName,
    createdAt: studioInterviewSchedule.createdAt,
    roundLabel: studioInterviewSchedule.roundLabel,
    scheduledAt: studioInterviewSchedule.scheduledAt,
  } as const;
  const column = columnMap[sortBy];
  return sortOrder === "asc" ? asc(column) : desc(column);
}

function buildWhere(organizationId: string, filters?: { search?: string; statuses?: ScheduleEntryStatus[] }) {
  const conditions = [eq(studioInterviewSchedule.organizationId, organizationId)];
  if (filters?.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(studioInterview.candidateName, term),
        ilike(studioInterview.candidateEmail, term),
        ilike(studioInterview.targetRole, term),
        ilike(studioInterview.resumeFileName, term),
        ilike(studioInterviewSchedule.roundLabel, term),
      )!,
    );
  }
  if (filters?.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(studioInterviewSchedule.status, filters.statuses));
  }
  return and(...conditions);
}

function serializeDate(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

type Row = Awaited<ReturnType<typeof db.select<typeof SELECTED_COLUMNS>>>[number];

function toListRow(row: Row): StudioInterviewRoundListRecord {
  return {
    allowTextInput: row.allowTextInput,
    candidateEmail: row.candidateEmail,
    candidateId: row.candidateId,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    conversationId: row.conversationId,
    createdAt: serializeDate(row.createdAt) ?? "",
    creatorName: row.creatorName,
    creatorOrganizationName: row.creatorOrganizationName,
    hasReport: Boolean(row.hasReport),
    hasResumeFile: Boolean(row.resumeStorageKey),
    id: row.id,
    interviewLink: buildInterviewLink(row.candidateId, row.id),
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    resumeFileName: row.resumeFileName,
    roundLabel: row.roundLabel,
    scheduledAt: serializeDate(row.scheduledAt),
    sortOrder: row.sortOrder,
    status: row.status,
    targetRole: row.targetRole,
    updatedAt: serializeDate(row.updatedAt) ?? "",
  };
}

export async function queryPaginatedInterviewRounds(
  organizationId: string,
  filters?: { search?: string | null; status?: string | null },
  pagination?: Record<string, unknown>,
): Promise<PaginatedStudioInterviewRoundsResult> {
  const search = filters?.search?.trim() || undefined;
  const statuses = parseStatusFilter(filters?.status);
  const { page, pageSize, sortBy, sortOrder } = parsePagination(pagination);
  const offset = (page - 1) * pageSize;
  const where = buildWhere(organizationId, { search, statuses });

  const [rows, [totalRow]] = await Promise.all([
    db
      .select(SELECTED_COLUMNS)
      .from(studioInterviewSchedule)
      .leftJoin(studioInterview, eq(studioInterviewSchedule.interviewRecordId, studioInterview.id))
      .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
      .leftJoin(user, eq(studioInterview.createdBy, user.id))
      .where(where)
      .orderBy(buildOrderBy(sortBy, sortOrder))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(studioInterviewSchedule)
      .leftJoin(studioInterview, eq(studioInterviewSchedule.interviewRecordId, studioInterview.id))
      .where(where),
  ]);

  const total = totalRow?.count ?? 0;
  return {
    page,
    pageSize,
    records: rows.map(toListRow),
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Cached version for Server Components */
// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export async function listInterviewRounds(
  organizationId: string,
  filters?: { search?: string | null; status?: string | null },
  pagination?: Record<string, unknown>,
) {
  "use cache";
  cacheTag("studio-interviews");
  cacheLife("minutes");
  return queryPaginatedInterviewRounds(organizationId, filters, pagination);
}

export async function loadInterviewRoundDetail(
  roundId: string,
  organizationId: string,
): Promise<StudioInterviewRoundDetail | null> {
  const [row] = await db
    .select({
      allowTextInput: studioInterviewSchedule.allowTextInput,
      candidateId: studioInterviewSchedule.interviewRecordId,
      conversationId: studioInterviewSchedule.conversationId,
      createdAt: studioInterviewSchedule.createdAt,
      disconnectedAt: studioInterviewSchedule.disconnectedAt,
      id: studioInterviewSchedule.id,
      notes: studioInterviewSchedule.notes,
      roundLabel: studioInterviewSchedule.roundLabel,
      scheduledAt: studioInterviewSchedule.scheduledAt,
      sessionStartedAt: studioInterviewSchedule.sessionStartedAt,
      sortOrder: studioInterviewSchedule.sortOrder,
      status: studioInterviewSchedule.status,
      updatedAt: studioInterviewSchedule.updatedAt,
    })
    .from(studioInterviewSchedule)
    .where(
      and(
        eq(studioInterviewSchedule.id, roundId),
        eq(studioInterviewSchedule.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const candidate = await loadStudioCandidate(row.candidateId, organizationId);
  if (!candidate) return null;

  const [reportRow] = await db
    .select({ id: interviewConversation.conversationId })
    .from(interviewConversation)
    .where(eq(interviewConversation.scheduleEntryId, row.id))
    .limit(1);

  return {
    allowTextInput: row.allowTextInput,
    candidate,
    conversationId: row.conversationId,
    createdAt: serializeDate(row.createdAt) ?? "",
    disconnectedAt: serializeDate(row.disconnectedAt),
    hasReport: Boolean(reportRow),
    id: row.id,
    interviewLink: buildInterviewLink(row.candidateId, row.id),
    notes: row.notes,
    roundLabel: row.roundLabel,
    scheduledAt: serializeDate(row.scheduledAt),
    sessionStartedAt: serializeDate(row.sessionStartedAt),
    sortOrder: row.sortOrder,
    status: row.status,
    updatedAt: serializeDate(row.updatedAt) ?? "",
  };
}

export interface InterviewRoundSummary {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  interrupted: number;
}

export async function summarizeInterviewRoundCounts(
  organizationId: string,
): Promise<InterviewRoundSummary> {
  const rows = await db
    .select({ count: count(), status: studioInterviewSchedule.status })
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.organizationId, organizationId))
    .groupBy(studioInterviewSchedule.status);

  let total = 0;
  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  let interrupted = 0;
  for (const row of rows) {
    total += row.count;
    if (row.status === "pending") pending = row.count;
    else if (row.status === "in_progress") inProgress = row.count;
    else if (row.status === "completed") completed = row.count;
    else if (row.status === "interrupted") interrupted = row.count;
  }
  return { completed, inProgress, interrupted, pending, total };
}

/** Resolve candidateId from roundId; null if not found. */
export async function resolveCandidateIdForRound(
  roundId: string,
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ candidateId: studioInterviewSchedule.interviewRecordId })
    .from(studioInterviewSchedule)
    .where(
      and(
        eq(studioInterviewSchedule.id, roundId),
        eq(studioInterviewSchedule.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row?.candidateId ?? null;
}
```

- [ ] **Step 3: 在 `studio-interviews.ts` DAO 中新增 `loadStudioCandidate`**

Open `src/server/routes/studio/routes/interviews/dao/studio-interviews.ts`. The file currently has a private helper structure; we want to ADD a public `loadStudioCandidate(id, organizationId): Promise<StudioCandidateRecord | null>` at the bottom of the public-API section.

```ts
// (add near the other exports at the bottom)

import type { StudioCandidateRecord } from "@/lib/shared/studio-candidates";

/**
 * Load a candidate (studio_interview row) with JD + creator info, without
 * embedding scheduleEntries (those belong to the round-side view).
 * 加载候选人聚合记录（不含 scheduleEntries —— 那是 round 维度的事）。
 */
export async function loadStudioCandidate(
  candidateId: string,
  organizationId: string,
): Promise<StudioCandidateRecord | null> {
  const [row] = await db
    .select({
      candidateEmail: studioInterview.candidateEmail,
      candidateName: studioInterview.candidateName,
      candidatePhone: studioInterview.candidatePhone,
      createdAt: studioInterview.createdAt,
      createdBy: studioInterview.createdBy,
      creatorName: user.name,
      creatorOrganizationName: user.feishuTenantName,
      id: studioInterview.id,
      interviewQuestions: studioInterview.interviewQuestions,
      jobDescriptionId: studioInterview.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      notes: studioInterview.notes,
      resumeContentHash: studioInterview.resumeContentHash,
      resumeFileName: studioInterview.resumeFileName,
      resumeProfile: studioInterview.resumeProfile,
      resumeStorageKey: studioInterview.resumeStorageKey,
      status: studioInterview.status,
      targetRole: studioInterview.targetRole,
      updatedAt: studioInterview.updatedAt,
    })
    .from(studioInterview)
    .leftJoin(user, eq(studioInterview.createdBy, user.id))
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(and(eq(studioInterview.id, candidateId), eq(studioInterview.organizationId, organizationId)))
    .limit(1);

  if (!row) return null;

  return {
    candidateEmail: row.candidateEmail,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    createdBy: row.createdBy,
    creatorName: row.creatorName,
    creatorOrganizationName: row.creatorOrganizationName,
    id: row.id,
    interviewQuestions: row.interviewQuestions ?? [],
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    notes: row.notes,
    resumeContentHash: row.resumeContentHash,
    resumeFileName: row.resumeFileName,
    resumeProfile: row.resumeProfile,
    resumeStorageKey: row.resumeStorageKey,
    status: row.status,
    targetRole: row.targetRole,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}
```

- [ ] **Step 4: 跑测试，应全绿**

```bash
pnpm test src/server/routes/studio/routes/interviews/dao/__tests__/interview-rounds.test.ts
```
Expected: 3 describe blocks × 多个 it = 全 PASS

- [ ] **Step 5: typecheck**

```bash
pnpm typecheck
```
Expected: 与 Task 1 后状态相同（DAO 新代码自洽，旧 callers 还在用旧接口）。

- [ ] **Step 6: commit**

```bash
git add src/server/routes/studio/routes/interviews/dao/interview-rounds.ts \
        src/server/routes/studio/routes/interviews/dao/__tests__/interview-rounds.test.ts \
        src/server/routes/studio/routes/interviews/dao/studio-interviews.ts
git commit -m "feat(studio): add interview-rounds DAO + loadStudioCandidate"
```

---

## Phase 3 — End-to-end vertical: list + summary

### Task 3: GET `/` + GET `/summary` + 列表页（server + client + page）

**Files:**
- Modify: `src/server/routes/studio/routes/interviews/route.ts` (GET `/` and GET `/summary` handlers)
- Modify: `src/lib/client/api/endpoints/studio-interviews.ts`
- Modify: `src/app/(auth)/w/[slug]/studio/interviews/page.tsx`
- Modify: `src/app/(auth)/w/[slug]/studio/interviews/_components/interview-management-page.tsx`

- [ ] **Step 1: 改 route.ts GET `/` handler**

Find `GET "/"` (around line 95). Currently it imports `queryPaginatedStudioInterviewRecords`. Replace the import and the handler body to use rounds DAO:

```ts
// in imports
import {
  loadInterviewRoundDetail,
  queryPaginatedInterviewRounds,
  summarizeInterviewRoundCounts,
} from "@/server/routes/studio/routes/interviews/dao/interview-rounds";
```

Replace handler body — query params unchanged (still `page` / `pageSize` / `search` / `status` / `sortBy` / `sortOrder`); just delegate:

```ts
.get(
  "/",
  requirePermission("interview", "read"),
  zValidator(
    "query",
    z.object({
      page: z.string().optional(),
      pageSize: z.string().optional(),
      search: z.string().optional(),
      status: z.string().optional(),
      sortBy: z.string().optional(),
      sortOrder: z.string().optional(),
    }),
    jsonValidatorError("查询参数无效。"),
  ),
  async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const q = c.req.valid("query");
    const result = await queryPaginatedInterviewRounds(
      activeOrg.id,
      { search: q.search, status: q.status },
      { page: q.page, pageSize: q.pageSize, sortBy: q.sortBy, sortOrder: q.sortOrder },
    );
    return c.json(result, 200);
  },
)
```

- [ ] **Step 2: 改 route.ts GET `/summary` handler**

Find `GET "/summary"` (around line 69). Replace:

```ts
.get("/summary", requirePermission("interview", "read"), async (c) => {
  const { activeOrg } = c.var;
  if (!activeOrg) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const summary = await summarizeInterviewRoundCounts(activeOrg.id);
  return c.json(summary, 200);
})
```

- [ ] **Step 3: 重命名客户端 helpers**

Open `src/lib/client/api/endpoints/studio-interviews.ts`. Replace top imports + the list/summary helpers:

```ts
import type {
  PaginatedStudioInterviewRoundsResult,
  StudioInterviewRoundListRecord,
} from "@/lib/shared/studio-interview-rounds";

// (delete) StudioInterviewListResponse — superseded by PaginatedStudioInterviewRoundsResult

export interface StudioInterviewRoundListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}

export function fetchStudioInterviewRounds(
  slug: string,
  params: StudioInterviewRoundListParams = {},
): Promise<PaginatedStudioInterviewRoundsResult> {
  return rpcFetch<PaginatedStudioInterviewRoundsResult>(
    rpc.api.w[":slug"].studio.interviews.$get({
      param: { slug },
      query: {
        ...(params.page === undefined ? {} : { page: String(params.page) }),
        ...(params.pageSize === undefined ? {} : { pageSize: String(params.pageSize) }),
        ...(params.search ? { search: params.search } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
    }),
    "加载面试列表失败",
  );
}

export interface InterviewRoundSummaryResponse {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  interrupted: number;
}

export function fetchStudioInterviewSummary(
  slug: string,
): Promise<InterviewRoundSummaryResponse> {
  return rpcFetch<InterviewRoundSummaryResponse>(
    rpc.api.w[":slug"].studio.interviews.summary.$get({ param: { slug } }),
    "加载概览失败",
  );
}
```

Delete the legacy `fetchStudioInterviews` / `StudioInterviewListParams` / `StudioInterviewListResponse` exports.

- [ ] **Step 4: 改 `page.tsx`（Server Component）初始 fetch**

Open `src/app/(auth)/w/[slug]/studio/interviews/page.tsx`. Currently imports `listStudioInterviewRecords` and `queryStudioInterviewSummary`. Replace to use the new functions:

```ts
import { listInterviewRounds, summarizeInterviewRoundCounts } from "@/server/routes/studio/routes/interviews/dao/interview-rounds";

// ... inside the component ...
const [initialData, initialSummary] = await Promise.all([
  listInterviewRounds(activeOrg.id),
  summarizeInterviewRoundCounts(activeOrg.id),
]);
```

- [ ] **Step 5: 重写 `interview-management-page.tsx`**

Open `src/app/(auth)/w/[slug]/studio/interviews/_components/interview-management-page.tsx`. The full rewrite is long; the key changes:

1. Replace row type:
```ts
import type {
  PaginatedStudioInterviewRoundsResult,
  StudioInterviewRoundListRecord,
} from "@/lib/shared/studio-interview-rounds";
import type { InterviewRoundSummaryResponse } from "@/lib/client/api";
import { fetchStudioInterviewRounds, fetchStudioInterviewSummary } from "@/lib/client/api";
```

2. Replace `initialData` / `initialSummary` types in props:
```ts
export function InterviewManagementPage({
  initialData,
  initialSummary,
}: {
  initialData: PaginatedStudioInterviewRoundsResult;
  initialSummary: InterviewRoundSummaryResponse;
}) {
```

3. Replace columns (the `columns` const). Replace with:

```ts
const columns = useMemo<ColumnDef<StudioInterviewRoundListRecord>[]>(
  () => [
    selectColumn<StudioInterviewRoundListRecord>(),
    textColumn<StudioInterviewRoundListRecord>({
      accessorKey: "candidateName",
      header: "候选人",
      cell: (info) => info.row.original.candidateName,
    }),
    textColumn<StudioInterviewRoundListRecord>({
      accessorKey: "jobDescriptionName",
      header: "在招岗位",
      cell: (info) => info.row.original.jobDescriptionName ?? "—",
    }),
    textColumn<StudioInterviewRoundListRecord>({
      accessorKey: "roundLabel",
      header: "轮次",
      cell: (info) => info.row.original.roundLabel,
    }),
    dateColumn<StudioInterviewRoundListRecord>({
      accessorKey: "scheduledAt",
      header: "排期",
      formatNull: () => "未排期",
    }),
    customColumn<StudioInterviewRoundListRecord>({
      accessorKey: "status",
      header: "状态",
      cell: (info) => {
        const meta = scheduleEntryStatusMeta[info.row.original.status];
        return <Badge variant={meta.tone}>{meta.label}</Badge>;
      },
    }),
    customColumn<StudioInterviewRoundListRecord>({
      accessorKey: "hasReport",
      header: "报告",
      cell: (info) =>
        info.row.original.hasReport ? <Badge variant="default">已生成</Badge> : <span className="text-muted-foreground">—</span>,
    }),
    dateColumn<StudioInterviewRoundListRecord>({ accessorKey: "createdAt", header: "创建于" }),
    actionsColumn<StudioInterviewRoundListRecord>({
      actions: [
        { icon: EyeIcon, label: "查看详情", onClick: (r) => setDetailRecordId(r.id) },
        { icon: CopyIcon, label: "复制面试链接", onClick: (r) => void copyInterviewLink(r) },
        { icon: Trash2Icon, label: "删除轮次", onClick: (r) => setDeleteId(r.id), variant: "destructive" },
      ],
    }),
  ],
  [],
);
```

> **Note**: `scheduleEntryStatusMeta` already exists in `studio-interviews.ts` (4 statuses). Import it.

4. Replace `copyInterviewLink` body:
```ts
async function copyInterviewLink(record: StudioInterviewRoundListRecord) {
  const fullLink = toAbsoluteUrl(record.interviewLink);
  // ... rest unchanged ...
}
```

5. Replace `filtersConfig` — keep search; change status filter to round statuses:
```ts
const filtersConfig = useMemo(
  () => ({
    status: {
      label: "状态",
      type: "multiselect" as const,
      options: [
        { label: "待开始", value: "pending" },
        { label: "进行中", value: "in_progress" },
        { label: "已完成", value: "completed" },
        { label: "已中断", value: "interrupted" },
      ],
    },
  }),
  [],
);
```

6. Replace Summary stats — use new shape (total / pending / inProgress / completed / interrupted).

7. Single-delete + bulk-delete:
```ts
async function handleConfirmDelete() {
  if (!deleteId) return;
  try {
    await deleteStudioInterviewRound(slug, deleteId);
    toast.success("已删除该轮次");
    invalidateAll();
  } finally {
    setDeleteId(null);
  }
}

async function handleBulkDelete(selectedIds: string[]) {
  try {
    await bulkDeleteStudioInterviewRounds(slug, selectedIds);
    toast.success(`已删除 ${selectedIds.length} 条`);
    invalidateAll();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "批量删除失败");
  } finally {
    setBulkDeleteOpen(false);
  }
}
```

8. Empty-state description: 改为 "请前往简历库新建简历记录，选择「保存并发起面试」即可创建面试。"（已经在前一个 PR 中改过 — 校验文案保持一致）

9. Initial query params for `useDataGridState`: change sortBy default to `scheduledAt`, sortOrder `desc`.

> The `deleteStudioInterviewRound` / `bulkDeleteStudioInterviewRounds` helpers are added in T5 — for T3 we can stub-import; if not yet defined, this task can either (a) leave the delete buttons disabled OR (b) keep using `deleteStudioInterview` / `bulkDeleteStudioInterviews` until T5 renames them. Prefer (b): change in T5.

- [ ] **Step 6: typecheck + visual smoke**

```bash
pnpm typecheck
```
Expected: list page paths typecheck clean.

```bash
pnpm dev
```
Open `/w/<slug>/studio/interviews` — list should render with new columns. Old detail dialog may still misbehave (next task).

- [ ] **Step 7: commit**

```bash
git add src/server/routes/studio/routes/interviews/route.ts \
        src/lib/client/api/endpoints/studio-interviews.ts \
        src/app/\(auth\)/w/\[slug\]/studio/interviews/page.tsx \
        src/app/\(auth\)/w/\[slug\]/studio/interviews/_components/interview-management-page.tsx
git commit -m "feat(studio): pivot AI interview list + summary to round-keyed query"
```

---

## Phase 4 — End-to-end vertical: detail + sub-endpoints

### Task 4: GET `/:id` + sub-endpoints + detail dialog (server + client + dialog)

**Files:**
- Modify: `src/server/routes/studio/routes/interviews/route.ts` (GET `/:id`, GET `/:id/resume`, GET `/:id/agent-instructions`, GET `/:id/reports`, GET `/:id/recordings/:conversationId`, GET `/:id/form-submissions`, DELETE `/:id/form-submissions/:submissionId`, GET `/:id/question-template-bindings`, PUT `/:id/question-template-bindings`)
- Modify: `src/lib/client/api/endpoints/studio-interviews.ts`
- Modify: `src/app/(auth)/w/[slug]/studio/_components/studio-person-detail-dialog.tsx`

- [ ] **Step 1: 改 route.ts GET `/:id`**

Replace handler:

```ts
.get("/:id", requirePermission("interview", "read"), async (c) => {
  const { activeOrg } = c.var;
  if (!activeOrg) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const id = c.req.param("id");
  const detail = await loadInterviewRoundDetail(id, activeOrg.id);
  if (!detail) {
    return c.json({ error: "记录不存在。" }, 404);
  }
  return c.json(detail, 200);
})
```

- [ ] **Step 2: 改 sub-endpoints — pattern：resolve candidateId from roundId first**

Every sub-endpoint follows the pattern:

```ts
const id = c.req.param("id"); // now roundId
const candidateId = await resolveCandidateIdForRound(id, activeOrg.id);
if (!candidateId) {
  return c.json({ error: "记录不存在。" }, 404);
}
// ... use candidateId for candidate-keyed queries ...
```

Apply this rewrite to:

a. **GET `/:id/resume`** (around line 249) — replace the lookup with `resolveCandidateIdForRound`, then continue with the existing S3 retrieval against candidateId.

b. **GET `/:id/agent-instructions`** (around line 282) — same pattern; pass candidateId to `buildAgentInstructions`. The handler optionally augments instructions with roundLabel context; for now just pass candidateId.

c. **GET `/:id/reports`** — change semantics: only the conversations bound to this round. Replace body with:

```ts
.get("/:id/reports", requirePermission("interview", "read"), async (c) => {
  const { activeOrg } = c.var;
  if (!activeOrg) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const roundId = c.req.param("id");
  const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id);
  if (!candidateId) {
    return c.json({ error: "记录不存在。" }, 404);
  }
  const reports = await listInterviewConversationReportsByRound(roundId);
  return c.json(reports, 200);
})
```

This requires a new DAO function `listInterviewConversationReportsByRound(roundId)`. Add it to `dao/interview-conversations.ts` (mirrors `listInterviewConversationReports` but filters by `scheduleEntryId`):

```ts
// in dao/interview-conversations.ts

async function queryInterviewConversationReportsByRound(scheduleEntryId: string) {
  const conversations = await db
    .select()
    .from(interviewConversation)
    .where(eq(interviewConversation.scheduleEntryId, scheduleEntryId))
    .orderBy(desc(interviewConversation.updatedAt));

  if (conversations.length === 0) return [] as StudioInterviewConversationReport[];

  const conversationIds = conversations.map((c) => c.conversationId);
  const turnRows = await db
    .select()
    .from(interviewConversationTurn)
    .where(inArray(interviewConversationTurn.conversationId, conversationIds))
    .orderBy(asc(interviewConversationTurn.createdAt), asc(interviewConversationTurn.receivedAt));

  return conversations.map((conversation) => {
    const turns = turnRows.filter((t) => t.conversationId === conversation.conversationId);
    return serializeConversationReport(conversation, turns);
  });
}

export async function listInterviewConversationReportsByRound(scheduleEntryId: string) {
  "use cache";
  cacheTag("interview-conversations", `interview-conversations-round-${scheduleEntryId}`);
  cacheLife("minutes");
  return queryInterviewConversationReportsByRound(scheduleEntryId);
}
```

d. **GET `/:id/recordings/:conversationId`** — add scheduleEntryId check:

```ts
const roundId = c.req.param("id");
const conversationId = c.req.param("conversationId");
// fetch conversation; ensure its scheduleEntryId === roundId AND org match
const [conversation] = await db
  .select()
  .from(interviewConversation)
  .where(
    and(
      eq(interviewConversation.conversationId, conversationId),
      eq(interviewConversation.organizationId, activeOrg.id),
      eq(interviewConversation.scheduleEntryId, roundId),
    ),
  )
  .limit(1);
// ... rest of existing recording-URL logic ...
```

e. **GET `/:id/form-submissions`** — handler is inline (no separate DAO). Resolve `candidateId` from `roundId` at the top, then use the existing inline query but with `candidateId` substituted for the old `id`:

```ts
const roundId = c.req.param("id");
const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id);
if (!candidateId) return c.json({ error: "记录不存在。" }, 404);
// existing inline query (just s/id/candidateId)
const submissions = await db
  .select(/* existing columns */)
  .from(candidateFormSubmission)
  .where(
    and(
      eq(candidateFormSubmission.interviewRecordId, candidateId),
      eq(candidateFormSubmission.organizationId, activeOrg.id),
    ),
  )
  // ... existing leftJoin / orderBy ...
return c.json({ submissions }, 200);
```

f. **DELETE `/:id/form-submissions/:submissionId`** — same pattern; resolve candidateId, then use it where the old handler used `id`:

```ts
const roundId = c.req.param("id");
const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id);
if (!candidateId) return c.json({ error: "记录不存在。" }, 404);
// existing delete, with interviewRecordId = candidateId
```

g. **GET `/:id/question-template-bindings`** + **PUT `/:id/question-template-bindings`** — same pattern; resolve `candidateId` and use the existing inline query/update logic with `candidateId` substituted for the old `id`.

- [ ] **Step 3: 重命名客户端 helpers**

In `src/lib/client/api/endpoints/studio-interviews.ts`:

```ts
import type { StudioInterviewRoundDetail } from "@/lib/shared/studio-interview-rounds";

// Replace fetchStudioInterview → fetchStudioInterviewRound
export function fetchStudioInterviewRound(
  slug: string,
  roundId: string,
): Promise<StudioInterviewRoundDetail | null> {
  return rpcFetch<StudioInterviewRoundDetail>(
    rpc.api.w[":slug"].studio.interviews[":id"].$get({ param: { id: roundId, slug } }),
    "加载面试详情失败",
    { allow404: true },
  );
}

// Replace fetchStudioInterviewReports → fetchStudioInterviewRoundReports (signature shape unchanged)
export function fetchStudioInterviewRoundReports(
  slug: string,
  roundId: string,
): Promise<StudioInterviewConversationReport[]> {
  return rpcFetch<StudioInterviewConversationReport[]>(
    rpc.api.w[":slug"].studio.interviews[":id"].reports.$get({ param: { id: roundId, slug } }),
    "加载面试报告失败",
  );
}

// Replace fetchStudioInterviewRecordingUrl second arg name:
export function fetchStudioInterviewRecordingUrl(
  slug: string,
  roundId: string,
  conversationId: string,
) { /* body unchanged, just renamed param */ }

// Replace fetchStudioInterviewFormSubmissions → fetchStudioInterviewRoundFormSubmissions
export async function fetchStudioInterviewRoundFormSubmissions(
  slug: string,
  roundId: string,
): Promise<CandidateFormSubmissionWithSnapshot[]> { /* body unchanged */ }

// Replace deleteStudioInterviewFormSubmission(slug, interviewId, submissionId) — rename param
```

- [ ] **Step 4: 重塑 `studio-person-detail-dialog.tsx` interview 模式**

Open the file. The structural change:

a. Replace import:
```ts
import { fetchStudioInterviewRound, fetchStudioInterviewRoundReports, fetchStudioInterviewRoundFormSubmissions } from "@/lib/client/api";
import type { StudioInterviewRoundDetail } from "@/lib/shared/studio-interview-rounds";
```

b. Replace the `useQuery` for `interviewRecord`:
```ts
const { data: round, isLoading: isInterviewLoading } = useQuery({
  enabled: open && !!recordId && mode === "interview",
  queryFn: () => fetchStudioInterviewRound(slug, recordId as string),
  queryKey: ["studio-interview-round", slug, recordId],
  refetchOnWindowFocus: true,
});
```

c. Replace `reports` and `formSubmissions` queries to use `fetchStudioInterviewRoundReports` and `fetchStudioInterviewRoundFormSubmissions`.

d. Replace the `UnifiedRecord` interview-mode branch:
```ts
if (mode === "interview" && round) {
  record = {
    candidateEmail: round.candidate.candidateEmail,
    candidateName: round.candidate.candidateName,
    candidatePhone: round.candidate.candidatePhone,
    creatorName: round.candidate.creatorName,
    hasResumeFile: Boolean(round.candidate.resumeStorageKey),
    id: round.candidate.id, // candidate id for resume-related operations
    interviewQuestions: round.candidate.interviewQuestions,
    jobDescriptionName: round.candidate.jobDescriptionName,
    notes: round.candidate.notes,
    resumeFileName: round.candidate.resumeFileName,
    resumeProfile: round.candidate.resumeProfile,
    resumeStorageKey: round.candidate.resumeStorageKey,
    // Round-side fields, used in the new 「轮次概览」 card
    roundId: round.id,
    roundLabel: round.roundLabel,
    roundScheduledAt: round.scheduledAt,
    roundStatus: round.status,
    roundInterviewLink: round.interviewLink,
    roundAllowTextInput: round.allowTextInput,
    targetRole: round.candidate.targetRole,
  };
}
```

> Add the new fields to the `UnifiedRecord` interface accordingly.

e. **Header description** + status badge: change to use round-side status:
```tsx
{record?.roundStatus ? <Badge variant={scheduleEntryStatusMeta[record.roundStatus].tone}>{scheduleEntryStatusMeta[record.roundStatus].label}</Badge> : null}
```

f. **Replace 「面试安排」 section** with a 「轮次概览」 card showing:
- roundLabel + scheduledAt + status badge + complete interview link (copy button) + allowTextInput toggle + "重置轮次" button (only if status === "completed")

```tsx
<div className="rounded-2xl border border-border/60 bg-background p-5">
  <h3 className="font-medium text-sm">轮次概览</h3>
  {/* roundLabel + scheduledAt + status + interviewLink + allowTextInput + reset */}
</div>
```

g. Remove the existing "schedule entries map" (lines around 451-540 in the original); not needed since we only show this one round.

h. Sub-tabs (`reports` / `forms` / `instructions` / `questions` / `experience`) — they read from `recordId` query keys. Switch all the keys to use the roundId where the route is round-keyed (reports / forms / agent-instructions). For `questions` and `experience` they pull from `record` directly (the candidate snapshot).

i. The `interviewModeFooter` "编辑候选人信息" button currently does `router.push(\`/w/${slug}/studio/resumes?recordId=${record.id}\`)`. `record.id` is now the candidateId (see (d) above), so the link works correctly.

- [ ] **Step 5: typecheck + tests**

```bash
pnpm typecheck
pnpm test
```

- [ ] **Step 6: commit**

```bash
git add src/server/routes/studio/routes/interviews/route.ts \
        src/server/routes/studio/routes/interviews/dao/interview-conversations.ts \
        src/lib/client/api/endpoints/studio-interviews.ts \
        src/app/\(auth\)/w/\[slug\]/studio/_components/studio-person-detail-dialog.tsx
git commit -m "feat(studio): pivot AI interview detail + sub-endpoints to round-keyed access"
```

---

## Phase 5 — End-to-end vertical: round-level writes

### Task 5: PATCH / DELETE / reset / POST shape + edit dialog + 简历库回调 type

**Files:**
- Modify: `src/server/routes/studio/routes/interviews/route.ts` (PATCH `/:id`, DELETE `/:id`, POST `/bulk-delete`, POST `/:id/reset`, POST `/`)
- Modify: `src/lib/client/api/endpoints/studio-interviews.ts`
- Modify: `src/app/(auth)/w/[slug]/studio/_components/studio-person-edit-dialog.tsx`
- Modify: `src/app/(auth)/w/[slug]/studio/resumes/_components/upload-resume-dialog.tsx`
- Modify: `src/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page.tsx`

- [ ] **Step 1: PATCH `/:id` → round-level**

Replace the existing PATCH `/:id` (around line 494). New body:

```ts
.patch(
  "/:id",
  requirePermission("interview", "update"),
  zValidator(
    "json",
    z.object({
      allowTextInput: z.boolean().optional(),
      notes: z.string().trim().max(1000).optional().or(z.literal("")),
      scheduledAt: z.string().trim().optional().or(z.literal("")).nullable(),
      status: scheduleEntryStatusSchema.optional(),
    }),
    jsonValidatorError("请求参数无效。"),
  ),
  async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const roundId = c.req.param("id");
    const body = c.req.valid("json");

    const update: Partial<typeof studioInterviewSchedule.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.allowTextInput !== undefined) update.allowTextInput = body.allowTextInput;
    if (body.notes !== undefined) update.notes = body.notes || null;
    if (body.scheduledAt !== undefined) {
      update.scheduledAt =
        body.scheduledAt && body.scheduledAt.length > 0 ? new Date(body.scheduledAt) : null;
    }
    if (body.status !== undefined) update.status = body.status;

    const result = await db
      .update(studioInterviewSchedule)
      .set(update)
      .where(
        and(
          eq(studioInterviewSchedule.id, roundId),
          eq(studioInterviewSchedule.organizationId, activeOrg.id),
        ),
      )
      .returning({ id: studioInterviewSchedule.id });

    if (result.length === 0) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    invalidateStudioInterviewCaches();
    const detail = await loadInterviewRoundDetail(roundId, activeOrg.id);
    return c.json(detail, 200);
  },
)
```

- [ ] **Step 2: 删除嵌套 round 路径**

Remove the existing handlers:
- `PATCH "/:id/rounds/:roundId"` (around line 704) — folded into PATCH `/:id` above
- `POST "/:id/rounds/:roundId/reset"` (around line 624) — replaced below

- [ ] **Step 3: POST `/:id/reset` (扁平化)**

Add new flat reset endpoint at the equivalent location:

```ts
.post("/:id/reset", requirePermission("interview", "update"), async (c) => {
  const { activeOrg } = c.var;
  if (!activeOrg) return c.json({ message: "Unauthorized" }, 401);
  const roundId = c.req.param("id");

  // Reset round status to "pending", clear conversation linkage, etc.
  const result = await db
    .update(studioInterviewSchedule)
    .set({
      conversationId: null,
      disconnectedAt: null,
      liveKitParticipantIdentity: null,
      liveKitRoomName: null,
      sessionStartedAt: null,
      status: "pending",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(studioInterviewSchedule.id, roundId),
        eq(studioInterviewSchedule.organizationId, activeOrg.id),
      ),
    )
    .returning({ id: studioInterviewSchedule.id });

  if (result.length === 0) {
    return c.json({ error: "记录不存在。" }, 404);
  }

  invalidateStudioInterviewCaches();
  const detail = await loadInterviewRoundDetail(roundId, activeOrg.id);
  return c.json(detail, 200);
})
```

- [ ] **Step 4: DELETE `/:id` → 删 round**

Replace:

```ts
.delete("/:id", requirePermission("interview", "delete"), async (c) => {
  const { activeOrg } = c.var;
  if (!activeOrg) return c.json({ message: "Unauthorized" }, 401);
  const roundId = c.req.param("id");
  const result = await db
    .delete(studioInterviewSchedule)
    .where(
      and(
        eq(studioInterviewSchedule.id, roundId),
        eq(studioInterviewSchedule.organizationId, activeOrg.id),
      ),
    )
    .returning({ id: studioInterviewSchedule.id });
  if (result.length === 0) {
    return c.json({ error: "记录不存在。" }, 404);
  }
  invalidateStudioInterviewCaches();
  return c.json({ success: true }, 200);
})
```

- [ ] **Step 5: POST `/bulk-delete` → roundIds**

Replace (around line 770):

```ts
.post(
  "/bulk-delete",
  requirePermission("interview", "delete"),
  zValidator(
    "json",
    z.object({ ids: z.array(z.string()).nonempty() }),
    jsonValidatorError("缺少待删除的轮次 ID。"),
  ),
  async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) return c.json({ message: "Unauthorized" }, 401);
    const { ids } = c.req.valid("json");
    const result = await db
      .delete(studioInterviewSchedule)
      .where(
        and(
          inArray(studioInterviewSchedule.id, ids),
          eq(studioInterviewSchedule.organizationId, activeOrg.id),
        ),
      )
      .returning({ id: studioInterviewSchedule.id });
    invalidateStudioInterviewCaches();
    return c.json({ deletedCount: result.length, success: true }, 200);
  },
)
```

- [ ] **Step 6: POST `/` — change return value**

The existing POST `/` handler (around line 134) creates a candidate + N rounds in one transaction. After the transaction it currently returns the candidate via `serializeRecord`. Change the return to be the first round's list-record shape (so simrelative library callers get a `StudioInterviewRoundListRecord`):

```ts
// At the end of the POST handler, replace:
return c.json(serializeRecord(record, scheduleRows), 201);
// with:
const firstRoundId = scheduleRows[0]?.id;
if (!firstRoundId) {
  // Should not happen — handler always writes ≥1 schedule row when called from
  // resume library "保存并发起面试" — but if someone calls it without schedule
  // entries, return the candidate id projected to a list-shape with a synthetic
  // empty round won't compile. Safer to error.
  return c.json({ error: "未生成面试轮次。" }, 400);
}
const detail = await loadInterviewRoundDetail(firstRoundId, activeOrg.id);
return c.json(detail, 201);
```

> Note: the simrelative library "保存并发起面试" always sends `scheduleEntries=[createDefaultScheduleEntry()]` (1 row) — `firstRoundId` will always be defined for that flow.

- [ ] **Step 7: 客户端 helpers 重命名**

```ts
// Replace updateStudioInterviewRound (drop interviewId arg):
export function updateStudioInterviewRound(
  slug: string,
  roundId: string,
  payload: {
    allowTextInput?: boolean;
    notes?: string;
    scheduledAt?: string | null;
    status?: ScheduleEntryStatus;
  },
): Promise<StudioInterviewRoundDetail> {
  return rpcFetch<StudioInterviewRoundDetail>(
    rpc.api.w[":slug"].studio.interviews[":id"].$patch({
      json: payload,
      param: { id: roundId, slug },
    }),
    "更新轮次设置失败",
  );
}

// Replace resetStudioInterviewRound (drop interviewId arg):
export function resetStudioInterviewRound(
  slug: string,
  roundId: string,
): Promise<StudioInterviewRoundDetail> {
  return rpcFetch<StudioInterviewRoundDetail>(
    rpc.api.w[":slug"].studio.interviews[":id"].reset.$post({ param: { id: roundId, slug } }),
    "重置轮次失败",
  );
}

// Rename deleteStudioInterview → deleteStudioInterviewRound; body unchanged
export async function deleteStudioInterviewRound(slug: string, roundId: string): Promise<void> { /* ... */ }

// Rename bulkDeleteStudioInterviews → bulkDeleteStudioInterviewRounds; body unchanged
export async function bulkDeleteStudioInterviewRounds(
  slug: string,
  roundIds: string[],
): Promise<{ deleted: number; deletedCount?: number; success?: boolean }> { /* ... */ }
```

Where `ScheduleEntryStatus` is imported from `@/lib/shared/studio-interviews`.

- [ ] **Step 8: 重塑 `studio-person-edit-dialog.tsx` interview mode**

The interview-mode form currently lets users edit candidate-level fields (status / JD / notes). After this task, the interview-mode form edits **round-level fields**:
- roundLabel (read-only display)
- scheduledAt (datetime input — reuse `getScheduleEntryDateValue` for value formatting)
- allowTextInput (Switch)
- notes (textarea)
- status (select with `scheduleEntryStatusMeta` options: pending / in_progress / completed / interrupted)

Data flow:
1. On open, call `fetchStudioInterviewRound(slug, roundId)` to populate initial values from `round.allowTextInput / round.scheduledAt / round.notes / round.status`.
2. On submit, call `updateStudioInterviewRound(slug, roundId, { allowTextInput, scheduledAt, notes, status })`.
3. On success, invalidate parent list query and close.

The existing file has both `mode="resume"` and `mode="interview"` branches. Inspect the resume-mode branch's TanStack Form wiring + Modal layout and mirror the structure for the new round-edit form. The candidate-identity-locked banner in the existing resume-mode form ("候选人身份字段请到简历库编辑") is a good template — keep equivalent guidance for the interview mode if the user expects to edit candidate name etc. (just point them to 简历库).

- [ ] **Step 9: 简历库回调类型 swap**

In `src/app/(auth)/w/[slug]/studio/resumes/_components/upload-resume-dialog.tsx`:

```ts
import type { StudioInterviewRoundListRecord } from "@/lib/shared/studio-interview-rounds";
// import type { StudioInterviewRecord } from "@/lib/shared/studio-interviews"; // DELETE

export type CreateResumeRecordResult =
  | { mode: "save-only"; detail: ResumeLibraryDetail }
  | { mode: "save-and-start"; round: StudioInterviewRoundListRecord }; // rename `record` → `round`
```

Update the success path to call `onCreated({ mode: "save-and-start", round })`.

Update `apiFetch<StudioInterviewRecord>` → `apiFetch<StudioInterviewRoundListRecord>`.

> The POST handler returns `StudioInterviewRoundDetail` (from Step 6) — but the simrelative library only needs the list-row shape, which is a subset. To keep types simple, change `apiFetch<StudioInterviewRoundDetail>` and read out the list fields needed by the page handler (which is just `invalidateAll()`, so field-level access doesn't matter).

In `resume-library-page.tsx`:

```ts
function handleCreated(result: CreateResumeRecordResult) {
  invalidateAll();
  // Both modes only refresh the list. No redirect (Open Item resolved).
}
```

Type-update only — no behavior change.

- [ ] **Step 10: 简历库 detail footer push 移除 query 参数**

In `src/app/(auth)/w/[slug]/studio/_components/studio-person-detail-dialog.tsx`, find the resume-mode footer's "发起 AI 面试" button:

```tsx
router.push(`/w/${slug}/studio/interviews?recordId=${record.id}`);
```

Replace with:

```tsx
router.push(`/w/${slug}/studio/interviews`);
```

- [ ] **Step 11: typecheck + tests**

```bash
pnpm typecheck
pnpm test
```

- [ ] **Step 12: commit**

```bash
git add src/server/routes/studio/routes/interviews/route.ts \
        src/lib/client/api/endpoints/studio-interviews.ts \
        src/app/\(auth\)/w/\[slug\]/studio/_components/studio-person-edit-dialog.tsx \
        src/app/\(auth\)/w/\[slug\]/studio/_components/studio-person-detail-dialog.tsx \
        src/app/\(auth\)/w/\[slug\]/studio/resumes/_components/upload-resume-dialog.tsx \
        src/app/\(auth\)/w/\[slug\]/studio/resumes/_components/resume-library-page.tsx
git commit -m "feat(studio): round-level writes + edit dialog + resume library typing"
```

---

## Phase 6 — Cleanup

### Task 6: 删旧 types / DAO / 别名

**Files:**
- Modify: `src/lib/shared/studio-interviews.ts` — remove alias
- Modify: `src/server/routes/studio/routes/interviews/dao/studio-interviews.ts` — remove old DAOs
- Modify: `src/app/(auth)/w/[slug]/studio/interviews/_components/interview-form/index.ts` — likely needs cleanup if it referenced removed types
- Search-and-fix: any remaining references to legacy `StudioInterviewRecord` / `StudioInterviewListRecord`

- [ ] **Step 1: 删 alias in `studio-interviews.ts`**

Open `src/lib/shared/studio-interviews.ts` and remove the temporary `export type { StudioCandidateRecord as StudioInterviewRecord }` bridge added in T1.

- [ ] **Step 2: 删除旧 DAO**

In `src/server/routes/studio/routes/interviews/dao/studio-interviews.ts`, delete:
- `queryStudioInterviewRecords`
- `queryPaginatedStudioInterviewRecords`
- `queryStudioInterviewSummary`
- `listStudioInterviewRecords`
- `toStudioInterviewListRecord` (private helper)
- `listStudioInterviewRows` / `countStudioInterviewRows` / `loadScheduleEntries` / `groupScheduleEntries` / `findMatchingScheduleRecordIds` if unused
- The `PaginatedStudioInterviewResult` / `StudioInterviewSummary` interfaces if no consumers

Keep:
- `parsePagination` (if still consumed elsewhere — grep)
- `loadStudioCandidate` (used by `loadInterviewRoundDetail`)
- `queryInterviewDedup` (used by routes — DO NOT remove)

- [ ] **Step 3: grep 残留**

```bash
git grep -l "StudioInterviewRecord\b" src/
git grep -l "StudioInterviewListRecord\b" src/
git grep -l "queryPaginatedStudioInterviewRecords\b" src/
git grep -l "queryStudioInterviewSummary\b" src/
git grep -l "listStudioInterviewRecords\b" src/
git grep -l "fetchStudioInterview\b" src/   # the old singular-name helper, NOT fetchStudioInterviewRound
```

Each should be empty. If any hits remain, migrate them to the new types/helpers.

- [ ] **Step 4: typecheck + check + tests**

```bash
pnpm typecheck
pnpm check
pnpm test
```
All MUST pass.

- [ ] **Step 5: commit**

```bash
git add -A
git commit -m "refactor(studio): drop legacy candidate-keyed types and DAOs"
```

---

## Phase 7 — Verification

### Task 7: 全量验证 + 手动 e2e

**Files:** N/A — verification only

- [ ] **Step 1: 跑完整 CI**

```bash
pnpm typecheck
pnpm check
pnpm test
```
Expected: all PASS

- [ ] **Step 2: dev server**

```bash
pnpm dev
```

- [ ] **Step 3: 手动验收 —— AI 面试列表**

1. 访问 `/w/<slug>/studio/interviews`
2. 列表显示一行 = 一轮：候选人姓名 / JD / 轮次 / 排期 / 状态 / 报告 / 创建时间
3. 同一候选人有多轮时多行展示
4. 过滤器：搜索候选人姓名、按 status 过滤
5. 排序：默认按 scheduledAt desc
6. Summary 卡片：四个统计（总轮数 / 待开始 / 进行中 / 已完成 / 已中断）

- [ ] **Step 4: 手动验收 —— 详情**

1. 任意一行点「查看详情」 → 详情弹窗打开
2. 顶部「轮次概览」区块：roundLabel + scheduledAt + status badge + 链接 + allowTextInput toggle（+ 重置按钮如已完成）
3. 概览 tab：候选人信息 + 简历评价 + 最近一次面试结果（只显示本轮）
4. 面试报告 tab：只显示本轮的报告
5. AI 题目 tab：候选人级题目
6. 经历 tab：候选人简历
7. Agent 提示词 tab：基于候选人 + JD 构造
8. 表单答复 tab：候选人级（多轮共享）

- [ ] **Step 5: 手动验收 —— 编辑**

1. 详情 → 「编辑候选人信息」 → 跳转到 `/studio/resumes?recordId=<candidateId>`（候选人字段编辑走简历库）
2. 列表 actions → 「删除轮次」 → 该 round 行消失（其他轮次仍在）
3. 列表多选 → 批量删除 → 选中的多个 round 行消失

- [ ] **Step 6: 简历库回归**

1. `/studio/resumes` → 「新建简历记录」 → 「保存并发起面试」 → toast「已创建并发起 1 轮面试」 → 列表 prepend 候选人
2. 跳到 `/studio/interviews` → 新候选人的「一面」出现在列表第一行（按 scheduledAt = now 排序）
3. 简历库详情弹窗 → 「发起 AI 面试」 → 跳到 `/studio/interviews` 列表（无 query 参数）

- [ ] **Step 7: 公共面试链接回归**

1. 拿任一 round 的 interview link（可从列表 actions「复制面试链接」拿）
2. 浏览器无痕窗口打开 → 候选人侧入口正常工作
3. （已知约束）若候选人 candidate-level status = "archived"，public resolver 应拒绝；非 archived 状态正常

- [ ] **Step 8: 收口**

无新 commit。所有手动剧本通过即视为完成。

---

## Out-of-scope / Follow-ups（不在本次实现）

- 列表中同候选人多 round 行的视觉分组（按 candidateId hover 高亮等）
- 批量重置 / 批量复制链接 / 批量更新排期
- 候选人 PATCH 入口迁移到 `/studio/candidates/:id`（YAGNI，简历库已覆盖）
- 删除 `studio_interview.status` 列（DB schema 拆分是后续 PR）
- 简历库 detail footer 加 `?candidateId=` 让列表自动定位候选人的轮次（未来 UX 改进）

---

## Risk reminders

1. **同候选人多 round 在列表里的可读性**：列表行变多，按 scheduledAt 排序即可，本次不做视觉分组。
2. **interview_conversation.scheduleEntryId 是 nullable**：早期 conversation 行若无 scheduleEntryId 会从任何 round 视图消失（在 candidate 级聚合视图也已无人消费，可接受损失）。
3. **类型重命名爆炸半径**：T1 的 alias 桥 + T6 的 alias 删除是关键节点。中间 T3-T5 期间允许局部不一致，每个 task 结束时 `pnpm typecheck` 必须过。
4. **POST `/` 返回值变化**：简历库 onCreated 的 typing 同步在 T5 swap；type narrow 失败会 typecheck 错。
5. **轮次扁平化 `POST /:id/reset`**：旧前端如果还在请求 `/:id/rounds/:roundId/reset` 会 404；T5 同 commit 内更新客户端 helper 防止此风险。
