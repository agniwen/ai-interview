# Resume Library (简历库) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 简历库 page under the workspace "工作台" sidebar group that reads the existing `studioInterview` table, hides interview-specific fields, and supports standalone resume uploads (no interview-question generation).

**Architecture:** New sibling Hono route group `studio/routes/resumes/` with its own DAO that queries `studioInterview` but skips the schedule join and drops interview columns from the DTO. Upload pipeline calls `parseResumeFastToProfile` only — no `generateInterviewQuestionsForProfile`. New `resume:*` RBAC resource (parallel to `interview:*`). All mutations on either router invalidate both `studio-interviews` and `studio-resumes` cache tags via a shared helper.

**Tech Stack:** Next.js 16 App Router, Hono, Drizzle ORM, Better Auth (access control), Zod, TanStack Form, TanStack Query, shadcn/ui, Tailwind CSS v4. Tests via Vitest hitting the real PostgreSQL dev DB.

**Design spec:** `docs/superpowers/specs/2026-05-13-resume-library-design.md`

---

## File map

| File                                                                          | Purpose                         | Action                                                             |
| ----------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `src/lib/shared/permissions.ts`                                               | RBAC matrix                     | Modify — add `resume` resource to statement + every role           |
| `src/server/cache-tags.ts`                                                    | Cache invalidation helpers      | Modify — add `invalidateStudioInterviewCaches()`                   |
| `src/server/routes/studio/routes/interviews/route.ts`                         | AI 面试 route                   | Modify — swap `safeUpdateTag("studio-interviews")` → shared helper |
| `src/lib/shared/studio-resumes.ts`                                            | Resume library DTO + form Zod   | Create                                                             |
| `src/server/routes/studio/routes/resumes/dao/resumes.ts`                      | List/get/cached DAO             | Create                                                             |
| `src/server/routes/studio/routes/resumes/route.ts`                            | Hono handlers                   | Create                                                             |
| `src/server/routes/studio/routes/resumes/__tests__/route.test.ts`             | Integration tests               | Create                                                             |
| `src/server/routes/studio/route.ts`                                           | Studio aggregator               | Modify — mount `/resumes`                                          |
| `src/lib/client/api/endpoints/studio-resumes.ts`                              | Frontend RPC wrappers           | Create                                                             |
| `src/lib/client/api/index.ts`                                                 | API barrel                      | Modify — export new endpoints                                      |
| `src/app/(auth)/w/[slug]/studio/_components/studio-sidebar-slots.tsx`         | Sidebar                         | Modify — add 简历库 entry                                          |
| `src/components/resume-profile-view.tsx`                                      | Reusable ResumeProfile renderer | Create                                                             |
| `src/app/(auth)/w/[slug]/studio/resumes/page.tsx`                             | SSR entry                       | Create                                                             |
| `src/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page.tsx`  | List page                       | Create                                                             |
| `src/app/(auth)/w/[slug]/studio/resumes/_components/upload-resume-dialog.tsx` | Upload                          | Create                                                             |
| `src/app/(auth)/w/[slug]/studio/resumes/_components/edit-resume-dialog.tsx`   | Edit                            | Create                                                             |
| `src/app/(auth)/w/[slug]/studio/resumes/_components/resume-detail-dialog.tsx` | Detail                          | Create                                                             |

---

## Task 1: Add `resume` RBAC resource

**Files:**

- Modify: `src/lib/shared/permissions.ts`

- [ ] **Step 1: Add `resume` to the statement object**

Edit `src/lib/shared/permissions.ts`, inside `export const statement = { ... } as const;`, add a new line after the `questionTemplate` entry:

```ts
export const statement = {
  ...defaultStatements,
  auditLog: ["read"],
  candidateForm: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  interview: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  questionTemplate: ["create", "read", "update", "delete"],
  resume: ["create", "read", "update", "delete"],
} as const;
```

- [ ] **Step 2: Grant `resume` to owner, admin, hr (full CRUD), viewer (read-only)**

In the same file, in each role definition, add `resume`:

`owner`:

```ts
export const owner = ac.newRole({
  ...ownerAc.statements,
  auditLog: ["read"],
  candidateForm: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  interview: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  questionTemplate: ["create", "read", "update", "delete"],
  resume: ["create", "read", "update", "delete"],
});
```

`admin`:

```ts
export const admin = ac.newRole({
  ...adminAc.statements,
  auditLog: ["read"],
  candidateForm: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  interview: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  member: ["create", "delete"],
  questionTemplate: ["create", "read", "update", "delete"],
  resume: ["create", "read", "update", "delete"],
});
```

`hr`:

```ts
export const hr = ac.newRole({
  ...memberAc.statements,
  auditLog: ["read"],
  candidateForm: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  interview: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  questionTemplate: ["create", "read", "update", "delete"],
  resume: ["create", "read", "update", "delete"],
});
```

`viewer`:

```ts
export const viewer = ac.newRole({
  ...memberAc.statements,
  candidateForm: ["read"],
  chat: ["create", "read", "update", "delete"],
  department: ["read"],
  globalConfig: ["read"],
  interview: ["read"],
  interviewer: ["read"],
  jd: ["read"],
  questionTemplate: ["read"],
  resume: ["read"],
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/permissions.ts
git commit -m "feat(permissions): add resume resource to RBAC matrix"
```

---

## Task 2: Add shared cache invalidation helper

**Files:**

- Modify: `src/server/cache-tags.ts`

The 简历库 and AI 面试 pages share the underlying table. Centralize the dual-tag bump so callers can't forget one side.

- [ ] **Step 1: Add the helper**

Replace the contents of `src/server/cache-tags.ts` with:

```ts
import "server-only";

import { updateTag } from "next/cache";

/**
 * `next/cache#updateTag` 在某些路由处理上下文中会 throw（例如非动态路由内调用）。
 * 缓存失效是 best-effort —— 失败不应连累主写入路径，所以全部吞掉。
 *
 * `next/cache#updateTag` can throw in certain route handler contexts (e.g.
 * non-dynamic routes). Cache invalidation is best-effort — a failure must
 * not block the main write path, so swallow it.
 */
export function safeUpdateTag(tag: string) {
  try {
    updateTag(tag);
  } catch {
    // best-effort cache invalidation — non-critical
  }
}

/**
 * AI 面试与简历库共用同一张 studioInterview 表。任一侧写入后必须同时失效两个
 * cache tag，否则另一个页面会读到旧投影。集中在此处避免调用方漏掉一个。
 *
 * AI 面试 and the resume library share one `studioInterview` table. Any
 * mutation on either side must bust both cache tags or the other page reads
 * a stale projection. Centralised here so call sites can't forget one.
 */
export function invalidateStudioInterviewCaches() {
  safeUpdateTag("studio-interviews");
  safeUpdateTag("studio-resumes");
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/cache-tags.ts
git commit -m "feat(server): add shared studio interview cache invalidator"
```

---

## Task 3: Migrate interviews route to shared invalidator

**Files:**

- Modify: `src/server/routes/studio/routes/interviews/route.ts`

There are 7 call sites of `safeUpdateTag("studio-interviews")` in this file (lines 229, 612, 739, 787, 807, 839 are studio-interviews; line 740 is `safeUpdateTag("interview-conversations")` — leave that one). Replace the studio-interviews ones with the dual-bump helper.

- [ ] **Step 1: Update the import**

Change line 59 from:

```ts
import { safeUpdateTag } from "@/server/cache-tags";
```

to:

```ts
import { invalidateStudioInterviewCaches, safeUpdateTag } from "@/server/cache-tags";
```

- [ ] **Step 2: Replace each `safeUpdateTag("studio-interviews")` call**

In `src/server/routes/studio/routes/interviews/route.ts`, replace **every** occurrence of:

```ts
safeUpdateTag("studio-interviews");
```

with:

```ts
invalidateStudioInterviewCaches();
```

There should be 6 replacements (line 740's `safeUpdateTag("interview-conversations")` stays untouched). Use `Edit` with `replace_all: true` on the exact string `safeUpdateTag("studio-interviews");`.

- [ ] **Step 3: Verify no more `safeUpdateTag("studio-interviews")` calls remain in this file**

Run: `grep -n 'safeUpdateTag("studio-interviews")' src/server/routes/studio/routes/interviews/route.ts || echo OK`

Expected: `OK`.

- [ ] **Step 4: Typecheck + existing tests**

Run: `pnpm typecheck && pnpm test --run`

Expected: PASS (no behavior change — we just bumped an extra tag that doesn't exist yet, which is a no-op).

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/studio/routes/interviews/route.ts
git commit -m "refactor(interviews): use shared cache invalidator"
```

---

## Task 4: Add shared resume library types & form schema

**Files:**

- Create: `src/lib/shared/studio-resumes.ts`

This module is the contract between server DAO/route and the frontend. It MUST NOT import server-only code (`import "client-only"` and `import "server-only"` both forbidden — it's shared).

- [ ] **Step 1: Create the file**

Create `src/lib/shared/studio-resumes.ts` with:

```ts
import { z } from "zod";
import type { ResumeProfile } from "@/lib/shared/interview/types";

/**
 * 简历库列表行 DTO。AI 面试列表的精简投影：去掉 status / interviewQuestions /
 * scheduleEntries 等面试态字段，只保留候选人 / 简历 / 创建者维度。
 *
 * Resume library list row. A trimmed projection of the interview list — interview
 * status, generated questions and schedule entries are intentionally dropped so
 * the resume library view stays focused on candidate + resume metadata.
 */
export interface ResumeLibraryListRecord {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  notes: string | null;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  resumeFileName: string | null;
  resumeContentHash: string | null;
  hasResumeFile: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  creatorName: string | null;
  creatorOrganizationName: string | null;
}

/**
 * 单条详情 DTO：列表字段 + resumeProfile 结构化简历。
 *
 * Detail DTO: list fields plus the structured `resumeProfile` for the detail
 * dialog. No interview-side data is included.
 */
export interface ResumeLibraryDetail extends ResumeLibraryListRecord {
  resumeProfile: ResumeProfile | null;
}

export interface PaginatedResumeLibraryResult {
  records: ResumeLibraryListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 表单 schema（创建 / 编辑共用）。比 studioInterviewFormSchema 宽松：
 *   - 不要求至少一轮 scheduleEntries
 *   - 不要求 jobDescriptionId
 *   - 不需要 status（始终 draft）
 * 候选人姓名可空：服务端会用解析结果回填，最终落库时强制非空（兜底"未命名候选人"）。
 *
 * Create / edit form schema. Looser than `studioInterviewFormSchema`:
 *   - no schedule entries required
 *   - jobDescription is optional
 *   - no status field (always draft)
 * `candidateName` may be empty — the server falls back to the parsed profile
 * name (and finally "未命名候选人" if the resume has no name either).
 */
export const resumeLibraryFormSchema = z.object({
  candidateName: z.string().trim().max(120, "候选人姓名不能超过 120 个字符"),
  candidateEmail: z
    .string()
    .trim()
    .max(200, "邮箱不能超过 200 个字符")
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "请输入有效邮箱",
    }),
  candidatePhone: z.string().trim().max(40, "联系电话不能超过 40 个字符"),
  targetRole: z.string().trim().max(120, "目标岗位不能超过 120 个字符"),
  jobDescriptionId: z.string().trim().max(100),
  notes: z.string().trim().max(2000, "备注不能超过 2000 字"),
});

export type ResumeLibraryFormValues = z.infer<typeof resumeLibraryFormSchema>;

export function createResumeLibraryFormValues(): ResumeLibraryFormValues {
  return {
    candidateEmail: "",
    candidateName: "",
    candidatePhone: "",
    jobDescriptionId: "",
    notes: "",
    targetRole: "",
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/studio-resumes.ts
git commit -m "feat(shared): add resume library DTOs and form schema"
```

---

## Task 5: Resume library DAO (TDD)

**Files:**

- Create: `src/server/routes/studio/routes/resumes/dao/resumes.ts`
- Create: `src/server/routes/studio/routes/resumes/__tests__/dao.test.ts`

Strategy: write an integration test first that seeds two orgs and asserts the list is scoped per org and that interview-only fields are NOT in the returned shape. Then implement.

- [ ] **Step 1: Write the failing DAO test**

Create `src/server/routes/studio/routes/resumes/__tests__/dao.test.ts`:

```ts
// Real-DB integration test for the resume library DAO.
// Per project memory: integration tests hit the actual database — no mocks.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { member, organization, studioInterview, user } from "@/lib/shared/db/schema";
import { queryPaginatedResumeRecords } from "@/server/routes/studio/routes/resumes/dao/resumes";

const ORG_A = "test_org_resume_dao_a";
const ORG_B = "test_org_resume_dao_b";
const USER_ID = "test_user_resume_dao";

const NOW = new Date("2026-05-13T10:00:00.000Z");

async function cleanup() {
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_A));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_B));
  await db.delete(member).where(eq(member.userId, USER_ID));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeAll(async () => {
  await cleanup();

  await db.insert(user).values({
    createdAt: NOW,
    email: "resume-dao@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "resume-dao",
    updatedAt: NOW,
  });

  await db.insert(organization).values([
    { createdAt: NOW, id: ORG_A, name: "Org A", slug: "test-resume-dao-a" },
    { createdAt: NOW, id: ORG_B, name: "Org B", slug: "test-resume-dao-b" },
  ]);

  await db.insert(member).values([
    {
      createdAt: NOW,
      id: "m_resume_dao_a",
      organizationId: ORG_A,
      role: "owner",
      userId: USER_ID,
    },
    {
      createdAt: NOW,
      id: "m_resume_dao_b",
      organizationId: ORG_B,
      role: "owner",
      userId: USER_ID,
    },
  ]);

  await db.insert(studioInterview).values([
    {
      candidateName: "张三",
      candidateEmail: "zhang@example.com",
      createdAt: NOW,
      createdBy: USER_ID,
      id: "ri_test_a_1",
      interviewQuestions: [],
      notes: null,
      organizationId: ORG_A,
      resumeFileName: "zhang.pdf",
      status: "draft",
      targetRole: "前端工程师",
      updatedAt: NOW,
    },
    {
      candidateName: "李四",
      candidateEmail: "li@example.com",
      createdAt: NOW,
      createdBy: USER_ID,
      id: "ri_test_a_2",
      interviewQuestions: [],
      notes: null,
      organizationId: ORG_A,
      resumeFileName: null,
      status: "ready",
      targetRole: "产品经理",
      updatedAt: NOW,
    },
    {
      candidateName: "王五",
      candidateEmail: null,
      createdAt: NOW,
      createdBy: USER_ID,
      id: "ri_test_b_1",
      interviewQuestions: [],
      notes: null,
      organizationId: ORG_B,
      resumeFileName: "wang.pdf",
      status: "draft",
      targetRole: null,
      updatedAt: NOW,
    },
  ]);
});

afterAll(async () => {
  await cleanup();
});

describe("queryPaginatedResumeRecords", () => {
  it("lists rows scoped to the organization", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A);
    expect(result.total).toBe(2);
    const names = result.records.map((r) => r.candidateName).sort();
    expect(names).toEqual(["张三", "李四"].sort());
  });

  it("does not leak rows from sibling organizations", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A);
    expect(result.records.some((r) => r.candidateName === "王五")).toBe(false);
  });

  it("returns records without interview-only fields", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A);
    const sample = result.records[0]!;
    expect(sample).not.toHaveProperty("interviewQuestions");
    expect(sample).not.toHaveProperty("scheduleEntries");
    expect(sample).not.toHaveProperty("status");
    expect(sample.hasResumeFile).toBeTypeOf("boolean");
    expect(typeof sample.createdAt).toBe("string");
  });

  it("supports search filter against candidateName", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A, { search: "张三" });
    expect(result.total).toBe(1);
    expect(result.records[0]?.candidateName).toBe("张三");
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `pnpm test --run src/server/routes/studio/routes/resumes/__tests__/dao.test.ts`

Expected: FAIL (module not found — `queryPaginatedResumeRecords` doesn't exist yet).

- [ ] **Step 3: Implement the DAO**

Create `src/server/routes/studio/routes/resumes/dao/resumes.ts`:

```ts
import "server-only";

import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { jobDescription, studioInterview, user } from "@/lib/shared/db/schema";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryListRecord,
  ResumeLibraryDetail,
} from "@/lib/shared/studio-resumes";

const SORT_COLUMNS = ["createdAt", "candidateName", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(SORT_COLUMNS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const filtersSchema = z.object({
  search: z.string().trim().max(120).optional().nullable(),
});

type Pagination = z.infer<typeof paginationSchema>;
type Filters = z.infer<typeof filtersSchema>;

function buildWhere(organizationId: string, filters?: Filters) {
  const search = filters?.search?.trim();
  if (!search) {
    return eq(studioInterview.organizationId, organizationId);
  }
  const like = `%${search}%`;
  return and(
    eq(studioInterview.organizationId, organizationId),
    or(
      ilike(studioInterview.candidateName, like),
      ilike(studioInterview.candidateEmail, like),
      ilike(studioInterview.candidatePhone, like),
      ilike(studioInterview.resumeFileName, like),
      ilike(studioInterview.targetRole, like),
    ),
  );
}

function buildOrderBy(sortBy: SortColumn, sortOrder: "asc" | "desc") {
  const map = {
    candidateName: studioInterview.candidateName,
    createdAt: studioInterview.createdAt,
    updatedAt: studioInterview.updatedAt,
  } as const;
  return sortOrder === "asc" ? asc(map[sortBy]) : desc(map[sortBy]);
}

function serializeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

const SELECTED_COLUMNS = {
  candidateEmail: studioInterview.candidateEmail,
  candidateName: studioInterview.candidateName,
  candidatePhone: studioInterview.candidatePhone,
  createdAt: studioInterview.createdAt,
  createdBy: studioInterview.createdBy,
  creatorName: user.name,
  creatorOrganizationName: user.feishuTenantName,
  id: studioInterview.id,
  jobDescriptionId: studioInterview.jobDescriptionId,
  jobDescriptionName: jobDescription.name,
  notes: studioInterview.notes,
  resumeContentHash: studioInterview.resumeContentHash,
  resumeFileName: studioInterview.resumeFileName,
  resumeStorageKey: studioInterview.resumeStorageKey,
  targetRole: studioInterview.targetRole,
  updatedAt: studioInterview.updatedAt,
} as const;

type Row = Awaited<ReturnType<typeof selectRows>>[number];

async function selectRows({
  organizationId,
  filters,
  pagination,
}: {
  organizationId: string;
  filters?: Filters;
  pagination?: Partial<Pagination>;
}) {
  const { page, pageSize, sortBy, sortOrder } = paginationSchema.parse(pagination ?? {});
  const offset = (page - 1) * pageSize;

  return db
    .select(SELECTED_COLUMNS)
    .from(studioInterview)
    .leftJoin(user, eq(studioInterview.createdBy, user.id))
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(buildWhere(organizationId, filters))
    .orderBy(buildOrderBy(sortBy, sortOrder))
    .limit(pageSize)
    .offset(offset);
}

function toRecord(row: Row): ResumeLibraryListRecord {
  return {
    candidateEmail: row.candidateEmail,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    creatorName: row.creatorName,
    creatorOrganizationName: row.creatorOrganizationName,
    hasResumeFile: Boolean(row.resumeStorageKey),
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    notes: row.notes,
    resumeContentHash: row.resumeContentHash,
    resumeFileName: row.resumeFileName,
    targetRole: row.targetRole,
    updatedAt: serializeDate(row.updatedAt),
  };
}

export async function queryPaginatedResumeRecords(
  organizationId: string,
  filters?: { search?: string | null },
  pagination?: Partial<Pagination>,
): Promise<PaginatedResumeLibraryResult> {
  const parsedFilters = filtersSchema.parse(filters ?? {});
  const parsedPagination = paginationSchema.parse(pagination ?? {});
  const where = buildWhere(organizationId, parsedFilters);

  const [rows, [countRow]] = await Promise.all([
    selectRows({
      filters: parsedFilters,
      organizationId,
      pagination: parsedPagination,
    }),
    db.select({ count: count() }).from(studioInterview).where(where),
  ]);

  const total = countRow?.count ?? 0;
  return {
    page: parsedPagination.page,
    pageSize: parsedPagination.pageSize,
    records: rows.map(toRecord),
    total,
    totalPages: Math.max(1, Math.ceil(total / parsedPagination.pageSize)),
  };
}

/** Cached version for Server Components. */
// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export async function listResumeRecords(
  organizationId: string,
  filters?: { search?: string | null },
  pagination?: Partial<Pagination>,
) {
  "use cache";
  cacheTag("studio-resumes");
  cacheLife("minutes");
  return queryPaginatedResumeRecords(organizationId, filters, pagination);
}

export async function loadResumeDetail(
  id: string,
  organizationId: string,
): Promise<ResumeLibraryDetail | null> {
  const [row] = await db
    .select({
      ...SELECTED_COLUMNS,
      resumeProfile: studioInterview.resumeProfile,
    })
    .from(studioInterview)
    .leftJoin(user, eq(studioInterview.createdBy, user.id))
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const { resumeProfile, ...rest } = row;
  return {
    ...toRecord(rest),
    resumeProfile,
  };
}
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `pnpm test --run src/server/routes/studio/routes/resumes/__tests__/dao.test.ts`

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/studio/routes/resumes/dao/resumes.ts src/server/routes/studio/routes/resumes/__tests__/dao.test.ts
git commit -m "feat(resumes): add resume library DAO with scope tests"
```

---

## Task 6: Resume route handlers (TDD: scope + permission tests)

**Files:**

- Create: `src/server/routes/studio/routes/resumes/route.ts`
- Create: `src/server/routes/studio/routes/resumes/__tests__/route.test.ts`
- Modify: `src/server/routes/studio/route.ts`

We will write the route, mount it, and add a route-level test that hits the handler via the studio aggregator. The test uses `db` directly to seed and asserts only the JSON-list happy path. Auth/permission middleware is covered by the existing system; we just smoke-test that the handler returns the expected shape.

The route writes to the same `studioInterview` table but **MUST NOT** write `interviewQuestions`, `status`, or schedule rows on PATCH. The whitelist is the safety net.

- [ ] **Step 1: Create the route file**

Create `src/server/routes/studio/routes/resumes/route.ts`:

```ts
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getObjectStream } from "@/lib/server/s3";
import { studioInterview } from "@/lib/shared/db/schema";
import { invalidateStudioInterviewCaches } from "@/server/cache-tags";
import { factory, jsonValidatorError } from "@/server/factory";
import { parseResumeFastToProfile } from "@/server/agents/resume-analysis-agent";
import { requirePermission } from "@/server/middlewares/permission";
import {
  loadResumeDetail,
  queryPaginatedResumeRecords,
} from "@/server/routes/studio/routes/resumes/dao/resumes";
import {
  normalizeResumeFile,
  storeInterviewResume,
  toBadRequest,
} from "@/server/routes/interview/utils";
import { resumeLibraryFormSchema } from "@/lib/shared/studio-resumes";
import { queryInterviewDedup } from "@/server/routes/studio/routes/interviews/dao/studio-interviews";

const dedupCheckInputSchema = z.object({
  email: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

function toNullableString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseListFormInput(formData: FormData) {
  return resumeLibraryFormSchema.safeParse({
    candidateEmail: toNullableString(formData.get("candidateEmail")) ?? "",
    candidateName: toNullableString(formData.get("candidateName")) ?? "",
    candidatePhone: toNullableString(formData.get("candidatePhone")) ?? "",
    jobDescriptionId: toNullableString(formData.get("jobDescriptionId")) ?? "",
    notes: toNullableString(formData.get("notes")) ?? "",
    targetRole: toNullableString(formData.get("targetRole")) ?? "",
  });
}

export const resumeLibraryRouter = factory
  .createApp()
  .get(
    "/",
    requirePermission("resume", "read"),
    zValidator(
      "query",
      z.object({
        page: z.string().optional(),
        pageSize: z.string().optional(),
        search: z.string().optional(),
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
      const result = await queryPaginatedResumeRecords(
        activeOrg.id,
        { search: q.search },
        {
          page: q.page,
          pageSize: q.pageSize,
          sortBy: q.sortBy,
          sortOrder: q.sortOrder,
        },
      );
      return c.json(result, 200);
    },
  )
  .post(
    "/dedup-check",
    requirePermission("resume", "read"),
    zValidator("json", dedupCheckInputSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const matches = await queryInterviewDedup(activeOrg.id, {
        email: input.email ?? null,
        name: input.name ?? null,
        phone: input.phone ?? null,
      });
      return c.json({ matches }, 200);
    },
  )
  .get("/:id", requirePermission("resume", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await loadResumeDetail(id, activeOrg.id);
    if (!record) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .get("/:id/resume", requirePermission("resume", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadResumeDetail(id, activeOrg.id);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    if (!existing.hasResumeFile) {
      return c.json({ error: "该候选人没有可预览的简历 PDF。" }, 404);
    }

    const [row] = await db
      .select({
        resumeFileName: studioInterview.resumeFileName,
        resumeStorageKey: studioInterview.resumeStorageKey,
      })
      .from(studioInterview)
      .where(eq(studioInterview.id, id))
      .limit(1);

    if (!row?.resumeStorageKey) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    const object = await getObjectStream(row.resumeStorageKey);
    if (!object) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    const filename = row.resumeFileName || "resume.pdf";
    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Content-Type": object.contentType ?? "application/pdf",
        ...(object.contentLength !== undefined && {
          "Content-Length": String(object.contentLength),
        }),
      },
    });
  })
  // oxlint-disable-next-line complexity -- single create handler orchestrates upload + parse + insert.
  .post("/", requirePermission("resume", "create"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    try {
      const formData = await c.req.formData();
      const resume = normalizeResumeFile(formData.get("resume"));

      const input = parseListFormInput(formData);
      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
      }

      if (resume && !c.var.user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const now = new Date();
      const recordId = crypto.randomUUID();

      const uploadResult =
        resume && c.var.user
          ? await storeInterviewResume(recordId, resume, c.var.user.id, activeOrg.id)
          : null;
      const resumeStorageKey = uploadResult?.storageKey ?? null;
      const resumeContentHash = uploadResult?.contentHash ?? null;

      // Resume library never generates interview questions — we only need a
      // ResumeProfile for the detail dialog. Reuse the registry cache first;
      // fall back to a fresh parse. The question-generation stage is skipped.
      let resumeProfile = uploadResult?.cachedResumeProfile ?? null;
      let parsedFileName: string | null = resume?.name ?? null;
      if (resume && !resumeProfile) {
        const parsed = await parseResumeFastToProfile(resume);
        resumeProfile = parsed.resumeProfile;
        parsedFileName = resume.name;
      }

      const row = {
        candidateEmail: input.data.candidateEmail || null,
        candidateName: input.data.candidateName || resumeProfile?.name || "未命名候选人",
        candidatePhone: input.data.candidatePhone || resumeProfile?.phone || null,
        createdAt: now,
        createdBy: c.var.user?.id ?? null,
        id: recordId,
        interviewQuestions: [],
        jobDescriptionId: input.data.jobDescriptionId || null,
        notes: input.data.notes || null,
        organizationId: activeOrg.id,
        resumeContentHash,
        resumeFileName: parsedFileName,
        resumeProfile,
        resumeStorageKey,
        status: "draft" as const,
        targetRole: input.data.targetRole || resumeProfile?.targetRoles[0] || null,
        updatedAt: now,
      } satisfies typeof studioInterview.$inferInsert;

      await db.insert(studioInterview).values(row);

      invalidateStudioInterviewCaches();
      const detail = await loadResumeDetail(recordId, activeOrg.id);
      return c.json(detail, 201);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  .patch("/:id", requirePermission("resume", "update"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    try {
      const existing = await loadResumeDetail(id, activeOrg.id);
      if (!existing) {
        return c.json({ error: "记录不存在。" }, 404);
      }

      const formData = await c.req.formData();
      const resume = normalizeResumeFile(formData.get("resume"));
      const input = parseListFormInput(formData);
      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
      }

      if (resume && !c.var.user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const uploadResult =
        resume && c.var.user
          ? await storeInterviewResume(id, resume, c.var.user.id, activeOrg.id)
          : null;

      let resumeProfile = existing.resumeProfile;
      let resumeFileName = existing.resumeFileName;
      const resumeStorageKey = uploadResult?.storageKey ?? null;
      const resumeContentHash = uploadResult?.contentHash ?? null;

      if (resume) {
        resumeProfile =
          uploadResult?.cachedResumeProfile ??
          (await parseResumeFastToProfile(resume)).resumeProfile;
        resumeFileName = resume.name;
      }

      // 显式白名单写入 —— 绝不触碰 interviewQuestions / status / schedule。
      // Explicit whitelist write — never touches interviewQuestions / status / schedule.
      const update = {
        candidateEmail: input.data.candidateEmail || null,
        candidateName: input.data.candidateName || resumeProfile?.name || existing.candidateName,
        candidatePhone: input.data.candidatePhone || resumeProfile?.phone || null,
        jobDescriptionId: input.data.jobDescriptionId || null,
        notes: input.data.notes || null,
        targetRole: input.data.targetRole || resumeProfile?.targetRoles[0] || null,
        updatedAt: new Date(),
        ...(resume
          ? {
              resumeContentHash: resumeContentHash ?? existing.resumeContentHash,
              resumeFileName,
              resumeProfile,
              resumeStorageKey: resumeStorageKey ?? null,
            }
          : {}),
      } satisfies Partial<typeof studioInterview.$inferInsert>;

      await db
        .update(studioInterview)
        .set(update)
        .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)));

      invalidateStudioInterviewCaches();
      const detail = await loadResumeDetail(id, activeOrg.id);
      return c.json(detail, 200);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  .delete("/:id", requirePermission("resume", "delete"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const result = await db
      .delete(studioInterview)
      .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)))
      .returning({ id: studioInterview.id });
    if (result.length === 0) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    invalidateStudioInterviewCaches();
    return c.json({ success: true }, 200);
  })
  .post(
    "/bulk-delete",
    requirePermission("resume", "delete"),
    zValidator(
      "json",
      z.object({ ids: z.array(z.string()).nonempty() }),
      jsonValidatorError("缺少待删除的记录 ID。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { ids: rawIds } = c.req.valid("json");
      const ids = rawIds.filter((v): v is string => typeof v === "string" && v.length > 0);
      if (ids.length === 0) {
        return c.json({ error: "缺少待删除的记录 ID。" }, 400);
      }

      const result = await db
        .delete(studioInterview)
        .where(
          and(inArray(studioInterview.id, ids), eq(studioInterview.organizationId, activeOrg.id)),
        )
        .returning({ id: studioInterview.id });

      invalidateStudioInterviewCaches();
      return c.json({ deletedCount: result.length, success: true }, 200);
    },
  );
```

- [ ] **Step 2: Mount the router**

Edit `src/server/routes/studio/route.ts`. Add import below the other route imports:

```ts
import { resumeLibraryRouter } from "./routes/resumes/route";
```

And add `.route("/resumes", resumeLibraryRouter)` to the chain, after `.route("/interviews", studioInterviewsRouter)`. The final file should look like:

```ts
import { factory } from "@/server/factory";
import { authMiddleware } from "@/server/middlewares/auth";
import { workspaceMiddleware } from "@/server/middlewares/workspace";
import { departmentsRouter } from "./routes/departments/route";
import { candidateFormsRouter } from "./routes/forms/route";
import { globalConfigRouter } from "./routes/global-config/route";
import { interviewQuestionTemplatesRouter } from "./routes/interview-questions/route";
import { interviewersRouter } from "./routes/interviewers/route";
import { studioInterviewsRouter } from "./routes/interviews/route";
import { jobDescriptionsRouter } from "./routes/job-descriptions/route";
import { resumeLibraryRouter } from "./routes/resumes/route";
import { workspaceRouter } from "./routes/workspace/route";

export const studioRouter = factory
  .createApp()
  .use("*", authMiddleware, workspaceMiddleware)
  .route("/interviews", studioInterviewsRouter)
  .route("/resumes", resumeLibraryRouter)
  .route("/departments", departmentsRouter)
  .route("/global-config", globalConfigRouter)
  .route("/interviewers", interviewersRouter)
  .route("/job-descriptions", jobDescriptionsRouter)
  .route("/forms", candidateFormsRouter)
  .route("/interview-questions", interviewQuestionTemplatesRouter)
  .route("/workspace", workspaceRouter);
```

- [ ] **Step 3: Write the integration test for the list shape**

Create `src/server/routes/studio/routes/resumes/__tests__/route.test.ts`:

```ts
// Smoke test for the resume library route. We bypass the Hono pipeline (auth
// middleware needs a session cookie which is heavyweight to fake) and assert
// the DAO + handler glue directly via the same code paths that the live
// route calls. The DAO test already covers query scope; here we lock in the
// PATCH whitelist (no interview field bleed) and the create-without-resume
// flow that doesn't generate questions.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { member, organization, studioInterview, user } from "@/lib/shared/db/schema";
import { loadResumeDetail } from "@/server/routes/studio/routes/resumes/dao/resumes";

const ORG = "test_org_resume_route";
const USER_ID = "test_user_resume_route";
const NOW = new Date("2026-05-13T11:00:00.000Z");

async function cleanup() {
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG));
  await db.delete(member).where(eq(member.userId, USER_ID));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values({
    createdAt: NOW,
    email: "route-resume@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "route-resume",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG,
    name: "Route Org",
    slug: "test-route-resume",
  });
  await db.insert(member).values({
    createdAt: NOW,
    id: "m_route_resume",
    organizationId: ORG,
    role: "owner",
    userId: USER_ID,
  });
});

afterAll(async () => {
  await cleanup();
});

describe("resume detail DTO", () => {
  it("hides interview-only fields from the detail shape", async () => {
    await db.insert(studioInterview).values({
      candidateName: "测试",
      createdAt: NOW,
      createdBy: USER_ID,
      id: "ri_route_test",
      interviewQuestions: [
        { difficulty: "easy", order: 1, question: "Should never leak through detail DTO" },
      ],
      organizationId: ORG,
      status: "in_progress",
      updatedAt: NOW,
    });

    const detail = await loadResumeDetail("ri_route_test", ORG);
    expect(detail).not.toBeNull();
    expect(detail).not.toHaveProperty("interviewQuestions");
    expect(detail).not.toHaveProperty("scheduleEntries");
    expect(detail).not.toHaveProperty("status");
    expect(detail?.candidateName).toBe("测试");
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm test --run src/server/routes/studio/routes/resumes/__tests__/`

Expected: PASS (route smoke test + DAO test).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/studio/routes/resumes/ src/server/routes/studio/route.ts
git commit -m "feat(resumes): add resume library route + integration tests"
```

---

## Task 7: Frontend RPC endpoints

**Files:**

- Create: `src/lib/client/api/endpoints/studio-resumes.ts`
- Modify: `src/lib/client/api/index.ts`

- [ ] **Step 1: Create the endpoints module**

Create `src/lib/client/api/endpoints/studio-resumes.ts`:

```ts
import "client-only";

/**
 * Studio 后台「简历库」API。映射到 `/api/w/:slug/studio/resumes/*`。
 * 文件上传 (POST/PATCH 带 resume File) 由对话框组件直接用 fetch + FormData，
 * 不在本文件内（与 studio-interviews 同样的约定）。
 *
 * Resume library API — maps to `/api/w/:slug/studio/resumes/*`. File-upload
 * POST/PATCH stay on raw fetch+FormData inside their dialog components, same
 * convention as studio-interviews.
 */

import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryDetail,
} from "@/lib/shared/studio-resumes";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";
import type { DedupMatchRecord } from "./studio-interviews";

export interface ResumeListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export function fetchStudioResumes(
  slug: string,
  params: ResumeListParams = {},
): Promise<PaginatedResumeLibraryResult> {
  return rpcFetch<PaginatedResumeLibraryResult>(
    rpc.api.w[":slug"].studio.resumes.$get({
      param: { slug },
      query: {
        ...(params.page === undefined ? {} : { page: String(params.page) }),
        ...(params.pageSize === undefined ? {} : { pageSize: String(params.pageSize) }),
        ...(params.search ? { search: params.search } : {}),
        ...(params.sortBy ? { sortBy: params.sortBy } : {}),
        ...(params.sortOrder ? { sortOrder: params.sortOrder } : {}),
      },
    }),
    "加载简历列表失败",
  );
}

export function fetchStudioResume(slug: string, id: string): Promise<ResumeLibraryDetail | null> {
  return rpcFetch<ResumeLibraryDetail>(
    rpc.api.w[":slug"].studio.resumes[":id"].$get({ param: { id, slug } }),
    "加载简历详情失败",
    { allow404: true },
  );
}

export function fetchResumeDedup(
  slug: string,
  input: { name: string | null; email: string | null; phone: string | null },
): Promise<{ matches: DedupMatchRecord[] }> {
  return rpcFetch<{ matches: DedupMatchRecord[] }>(
    rpc.api.w[":slug"].studio.resumes["dedup-check"].$post({ json: input, param: { slug } }),
    "查重失败",
  );
}

export async function deleteStudioResume(slug: string, id: string): Promise<void> {
  await rpcFetch<{ success: boolean }>(
    rpc.api.w[":slug"].studio.resumes[":id"].$delete({ param: { id, slug } }),
    "删除简历失败",
  );
}

export async function bulkDeleteStudioResumes(
  slug: string,
  ids: string[],
): Promise<{ deleted: number }> {
  const data = await rpcFetch<{ deletedCount: number; success: boolean }>(
    rpc.api.w[":slug"].studio.resumes["bulk-delete"].$post({
      json: { ids: ids as [string, ...string[]] },
      param: { slug },
    }),
    "批量删除失败",
  );
  return { deleted: data.deletedCount };
}
```

- [ ] **Step 2: Export from the API barrel**

Edit `src/lib/client/api/index.ts` and add a new export line at the end:

```ts
export * from "./endpoints/studio-resumes";
```

Insert it after `export * from "./endpoints/resume";`. Final list of `export *` lines:

```ts
export * from "./endpoints/chat";
export * from "./endpoints/studio-interviews";
export * from "./endpoints/resume";
export * from "./endpoints/studio-resumes";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`

Expected: PASS (RPC client types are derived from `AppType` which now includes the resumes router).

- [ ] **Step 4: Commit**

```bash
git add src/lib/client/api/endpoints/studio-resumes.ts src/lib/client/api/index.ts
git commit -m "feat(client): add resume library RPC endpoints"
```

---

## Task 8: Sidebar entry

**Files:**

- Modify: `src/app/(auth)/w/[slug]/studio/_components/studio-sidebar-slots.tsx`

- [ ] **Step 1: Add `UsersIcon` to the lucide import**

In the import block at the top, change:

```ts
import {
  BotIcon,
  Building2Icon,
  ClipboardListIcon,
  FileTextIcon,
  ListChecksIcon,
  SettingsIcon,
  UserIcon,
  UserCircleIcon,
  UserCogIcon,
} from "lucide-react";
```

to:

```ts
import {
  BotIcon,
  Building2Icon,
  ClipboardListIcon,
  FileTextIcon,
  ListChecksIcon,
  SettingsIcon,
  UserIcon,
  UserCircleIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";
```

- [ ] **Step 2: Add the 简历库 nav item to the 工作台 group**

Replace the existing 工作台 group block:

```ts
  {
    items: [
      {
        action: "read",
        icon: BotIcon,
        path: "/studio/interviews",
        resource: "interview",
        title: "AI 面试",
      },
    ],
    label: "工作台",
  },
```

with:

```ts
  {
    items: [
      {
        action: "read",
        icon: BotIcon,
        path: "/studio/interviews",
        resource: "interview",
        title: "AI 面试",
      },
      {
        action: "read",
        icon: UsersIcon,
        path: "/studio/resumes",
        resource: "resume",
        title: "简历库",
      },
    ],
    label: "工作台",
  },
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`

Expected: PASS — `resource: "resume"` is now in the `statement` keys.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)/w/\[slug\]/studio/_components/studio-sidebar-slots.tsx
git commit -m "feat(studio-sidebar): add 简历库 nav entry"
```

---

## Task 9: Shared ResumeProfile renderer

**Files:**

- Create: `src/components/resume-profile-view.tsx`

A read-only renderer for `ResumeProfile` data, used in the resume detail dialog (and reusable from anywhere). Uses semantic HTML, MiSans (no `font-serif` per project preference).

- [ ] **Step 1: Create the component**

Create `src/components/resume-profile-view.tsx`:

```ts
import type { ResumeProfile } from "@/lib/shared/interview/types";

interface ResumeProfileViewProps {
  profile: ResumeProfile | null;
}

const PLACEHOLDER = "未发现信息";

function isPresent(value: string | null | undefined) {
  return Boolean(value && value.trim() && value.trim() !== PLACEHOLDER);
}

function FactRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">
        {value === null || value === "" ? "—" : value}
      </span>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">—</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-border/60 px-2.5 py-0.5 text-xs"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ResumeProfileView({ profile }: ResumeProfileViewProps) {
  if (!profile) {
    return (
      <p className="text-muted-foreground text-sm">
        暂无结构化简历，仅有候选人基础信息。
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-2 md:grid-cols-2">
        <FactRow label="姓名" value={isPresent(profile.name) ? profile.name : null} />
        <FactRow label="性别" value={isPresent(profile.gender) ? profile.gender : null} />
        <FactRow label="年龄" value={profile.age} />
        <FactRow label="工作年限" value={profile.workYears} />
        <FactRow label="邮箱" value={profile.email} />
        <FactRow label="电话" value={profile.phone} />
      </section>

      <section>
        <h4 className="mb-2 font-medium text-sm">求职意向</h4>
        <ChipList items={profile.targetRoles} />
      </section>

      <section>
        <h4 className="mb-2 font-medium text-sm">毕业院校</h4>
        <ChipList items={profile.schools} />
      </section>

      <section>
        <h4 className="mb-2 font-medium text-sm">掌握技能</h4>
        <ChipList items={profile.skills} />
      </section>

      <section>
        <h4 className="mb-2 font-medium text-sm">个人优势</h4>
        {profile.personalStrengths.length === 0 ? (
          <p className="text-muted-foreground text-sm">—</p>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-sm">
            {profile.personalStrengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 font-medium text-sm">工作经历</h4>
        {profile.workExperiences.length === 0 ? (
          <p className="text-muted-foreground text-sm">—</p>
        ) : (
          <ul className="space-y-3">
            {profile.workExperiences.map((exp, index) => (
              <li
                key={`${exp.company ?? "company"}-${index}`}
                className="rounded-md border border-border/60 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-sm">
                    {isPresent(exp.role) ? exp.role : "未发现岗位"}
                    {isPresent(exp.company) ? ` · ${exp.company}` : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {isPresent(exp.period) ? exp.period : ""}
                  </span>
                </div>
                {isPresent(exp.summary) ? (
                  <p className="mt-1 whitespace-pre-line text-muted-foreground text-sm">
                    {exp.summary}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 font-medium text-sm">项目经历</h4>
        {profile.projectExperiences.length === 0 ? (
          <p className="text-muted-foreground text-sm">—</p>
        ) : (
          <ul className="space-y-3">
            {profile.projectExperiences.map((proj, index) => (
              <li
                key={`${proj.name ?? "project"}-${index}`}
                className="rounded-md border border-border/60 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-sm">
                    {isPresent(proj.name) ? proj.name : "未命名项目"}
                    {isPresent(proj.role) ? ` · ${proj.role}` : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {isPresent(proj.period) ? proj.period : ""}
                  </span>
                </div>
                {isPresent(proj.summary) ? (
                  <p className="mt-1 whitespace-pre-line text-muted-foreground text-sm">
                    {proj.summary}
                  </p>
                ) : null}
                {proj.techStack.length > 0 ? (
                  <div className="mt-2">
                    <ChipList items={proj.techStack} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/resume-profile-view.tsx
git commit -m "feat(components): add reusable resume profile view"
```

---

## Task 10: Resume detail dialog

**Files:**

- Create: `src/app/(auth)/w/[slug]/studio/resumes/_components/resume-detail-dialog.tsx`

- [ ] **Step 1: Create the dialog**

Create the directory and file `src/app/(auth)/w/[slug]/studio/resumes/_components/resume-detail-dialog.tsx`:

```ts
"use client";

import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { useQuery } from "@tanstack/react-query";
import { BotIcon, ExternalLinkIcon, FileTextIcon, PencilIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ResumeProfileView } from "@/components/resume-profile-view";
import { fetchStudioResume } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

const PdfPreviewDialog = dynamic(
  async () => {
    const mod = await import("@/components/pdf-preview-dialog");
    return mod.PdfPreviewDialog;
  },
  { ssr: false },
);

interface ResumeDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string | null;
  onEdit: (recordId: string) => void;
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value ?? "—"}</span>
    </div>
  );
}

export function ResumeDetailDialog({
  open,
  onOpenChange,
  recordId,
  onEdit,
}: ResumeDetailDialogProps) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);

  const query = useQuery({
    enabled: open && Boolean(recordId),
    queryFn: () => fetchStudioResume(slug, recordId as string),
    queryKey: ["studio-resumes", slug, "detail", recordId] as const,
    staleTime: 30 * 1000,
  });

  const detail: ResumeLibraryDetail | null = query.data ?? null;

  function handleStartInterview() {
    if (!recordId) {
      return;
    }
    router.push(`/w/${slug}/studio/interviews?recordId=${recordId}`);
    onOpenChange(false);
  }

  return (
    <>
      <Modal
        onOpenChange={onOpenChange}
        open={open}
        title="简历详情"
        description="查看候选人基础信息与结构化简历。不显示面试态字段。"
        size="lg"
      >
        <div className="space-y-6">
          {query.isLoading || !detail ? (
            <p className="text-muted-foreground text-sm">加载中…</p>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="font-medium text-sm">基本信息</h3>
                <DetailRow label="姓名" value={detail.candidateName} />
                <DetailRow label="邮箱" value={detail.candidateEmail} />
                <DetailRow label="电话" value={detail.candidatePhone} />
                <DetailRow label="目标岗位" value={detail.targetRole} />
                <DetailRow label="关联岗位" value={detail.jobDescriptionName} />
                <DetailRow label="创建人" value={detail.creatorName} />
              </section>

              <section className="space-y-2">
                <h3 className="font-medium text-sm">简历</h3>
                {detail.hasResumeFile ? (
                  <Button
                    onClick={() => setPreviewOpen(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <FileTextIcon className="size-4" />
                    预览 {detail.resumeFileName ?? "PDF"}
                  </Button>
                ) : (
                  <p className="text-muted-foreground text-sm">该候选人没有上传 PDF。</p>
                )}
              </section>

              {detail.notes ? (
                <section className="space-y-2">
                  <h3 className="font-medium text-sm">备注</h3>
                  <p className="whitespace-pre-line text-sm">{detail.notes}</p>
                </section>
              ) : null}

              <section className="space-y-3">
                <h3 className="font-medium text-sm">结构化简历</h3>
                <ResumeProfileView profile={detail.resumeProfile} />
              </section>
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          {detail ? (
            <>
              <Button onClick={() => onEdit(detail.id)} type="button" variant="outline">
                <PencilIcon className="size-4" />
                编辑
              </Button>
              <Button onClick={handleStartInterview} type="button">
                <BotIcon className="size-4" />
                发起 AI 面试
                <ExternalLinkIcon className="size-3.5 opacity-70" />
              </Button>
            </>
          ) : null}
        </div>
      </Modal>

      {detail?.hasResumeFile && previewOpen ? (
        <PdfPreviewDialog
          filename={detail.resumeFileName ?? undefined}
          onOpenChange={setPreviewOpen}
          open={previewOpen}
          url={`/api/w/${slug}/studio/resumes/${detail.id}/resume`}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(auth)/w/[slug]/studio/resumes/_components/resume-detail-dialog.tsx'
git commit -m "feat(resumes): add resume detail dialog"
```

---

## Task 11: Upload resume dialog

**Files:**

- Create: `src/app/(auth)/w/[slug]/studio/resumes/_components/upload-resume-dialog.tsx`

A simpler counterpart to `CreateInterviewDialog`. Reuses identity-dedup pre-warn (calls the new `/dedup-check` under resumes). No question-generation, no schedule. Uses `apiFetch` directly for the multipart POST (RPC client can't handle FormData).

- [ ] **Step 1: Create the dialog**

```ts
"use client";

import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { useStore } from "@tanstack/react-form";
import { useForm } from "@tanstack/react-form";
import { FileUpIcon, LoaderCircleIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { JobDescriptionSelectField } from "@/app/(auth)/w/[slug]/studio/interviews/_components/job-description-select-field";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { apiFetch, fetchResumeDedup } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  createResumeLibraryFormValues,
  resumeLibraryFormSchema,
} from "@/lib/shared/studio-resumes";

interface FieldErrorLike {
  message?: string;
}

function toFieldErrors(errors: unknown[] | undefined): FieldErrorLike[] | undefined {
  // oxlint-disable-next-line promise/prefer-await-to-callbacks
  const mapped = (errors ?? []).flatMap((err) => {
    if (!err) return [];
    if (typeof err === "string") return [{ message: err }];
    if (typeof err === "object" && "message" in err) {
      const message = typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : undefined;
      return [{ message }];
    }
    return [];
  });
  return mapped.length > 0 ? mapped : undefined;
}

export function UploadResumeDialog({ onCreated }: { onCreated: (detail: ResumeLibraryDetail) => void }) {
  const slug = useWorkspaceSlug();
  const [open, setOpen] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm({
    defaultValues: createResumeLibraryFormValues(),
    onSubmit: async ({ value }) => {
      setSubmitting(true);
      try {
        // 1) identity dedup pre-warn (fire-and-show)
        if (value.candidateName || value.candidateEmail || value.candidatePhone) {
          const { matches } = await fetchResumeDedup(slug, {
            email: value.candidateEmail || null,
            name: value.candidateName || null,
            phone: value.candidatePhone || null,
          });
          if (matches.length > 0) {
            const proceed = window.confirm(
              `已存在 ${matches.length} 条相似候选人记录（按姓名/邮箱/电话匹配）。仍要继续录入吗？`,
            );
            if (!proceed) {
              setSubmitting(false);
              return;
            }
          }
        }

        // 2) build multipart form data and POST
        const formData = new FormData();
        formData.append("candidateName", value.candidateName);
        formData.append("candidateEmail", value.candidateEmail);
        formData.append("candidatePhone", value.candidatePhone);
        formData.append("targetRole", value.targetRole);
        formData.append("jobDescriptionId", value.jobDescriptionId);
        formData.append("notes", value.notes);
        if (resumeFile) {
          formData.append("resume", resumeFile);
        }

        const detail = await apiFetch<ResumeLibraryDetail>(
          `/api/w/${slug}/studio/resumes`,
          { body: formData, method: "POST" },
          "上传简历失败",
        );

        toast.success("简历已加入简历库");
        onCreated(detail);
        setOpen(false);
        form.reset(createResumeLibraryFormValues());
        setResumeFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "上传失败");
      } finally {
        setSubmitting(false);
      }
    },
    validators: {
      onSubmit: resumeLibraryFormSchema,
    },
  });

  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button">
        <UploadIcon className="size-4" />
        上传简历
      </Button>

      <Modal
        onOpenChange={(next) => {
          if (!next && submitting) return;
          setOpen(next);
        }}
        open={open}
        title="上传简历"
        description="将候选人简历加入简历库。不会生成面试题，也不会发起 AI 面试。"
        size="md"
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <Field>
            <FieldLabel htmlFor="resume-upload">简历 PDF（可选）</FieldLabel>
            <FieldContent className="gap-2">
              <label
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 border-dashed px-3 py-3 text-sm transition-colors hover:border-border"
                htmlFor="resume-upload"
              >
                <FileUpIcon className="size-4" />
                <span>{resumeFile ? resumeFile.name : "点击选择 PDF 文件，可留空"}</span>
              </label>
              <input
                accept="application/pdf"
                className="sr-only"
                id="resume-upload"
                onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                ref={fileInputRef}
                type="file"
              />
            </FieldContent>
          </Field>

          <form.Field name="jobDescriptionId">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <JobDescriptionSelectField
                  error={errors?.[0]?.message}
                  onChange={(next) => field.handleChange(next)}
                  value={field.state.value ?? ""}
                />
              );
            }}
          </form.Field>

          <FieldGroup className="grid gap-5 md:grid-cols-2 md:items-start">
            <form.Field name="candidateName">
              {(field) => {
                const errors = toFieldErrors(field.state.meta.errors);
                return (
                  <Field>
                    <FieldLabel htmlFor={field.name}>候选人姓名</FieldLabel>
                    <FieldContent className="gap-2">
                      <Input
                        id={field.name}
                        maxLength={120}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="可留空，自动从简历回填"
                        value={field.state.value}
                      />
                      <FieldError errors={errors} />
                    </FieldContent>
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="candidateEmail">
              {(field) => {
                const errors = toFieldErrors(field.state.meta.errors);
                return (
                  <Field>
                    <FieldLabel htmlFor={field.name}>候选人邮箱</FieldLabel>
                    <FieldContent className="gap-2">
                      <Input
                        id={field.name}
                        maxLength={200}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="candidate@example.com"
                        value={field.state.value}
                      />
                      <FieldError errors={errors} />
                    </FieldContent>
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="candidatePhone">
              {(field) => {
                const errors = toFieldErrors(field.state.meta.errors);
                return (
                  <Field>
                    <FieldLabel htmlFor={field.name}>联系电话</FieldLabel>
                    <FieldContent className="gap-2">
                      <Input
                        id={field.name}
                        maxLength={40}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        value={field.state.value}
                      />
                      <FieldError errors={errors} />
                    </FieldContent>
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="targetRole">
              {(field) => {
                const errors = toFieldErrors(field.state.meta.errors);
                return (
                  <Field>
                    <FieldLabel htmlFor={field.name}>目标岗位</FieldLabel>
                    <FieldContent className="gap-2">
                      <Input
                        id={field.name}
                        maxLength={120}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="如：前端工程师"
                        value={field.state.value}
                      />
                      <FieldError errors={errors} />
                    </FieldContent>
                  </Field>
                );
              }}
            </form.Field>
          </FieldGroup>

          <form.Field name="notes">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <Field>
                  <FieldLabel htmlFor={field.name}>备注</FieldLabel>
                  <FieldContent className="gap-2">
                    <div className="relative">
                      <Textarea
                        className="min-h-24 pb-6"
                        id={field.name}
                        maxLength={2000}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="候选人来源、业务线、关注点等"
                        rows={4}
                        value={field.state.value}
                      />
                      <TextareaCounter maxLength={2000} value={field.state.value} />
                    </div>
                    <FieldError errors={errors} />
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              disabled={isSubmitting}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              确认上传
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: Verify `JobDescriptionSelectField` import path is right**

Run: `ls 'src/app/(auth)/w/[slug]/studio/interviews/_components/job-description-select-field.tsx'`

Expected: file exists. (Confirmed earlier — it does.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`

Expected: PASS. Note: if the typecheck flags `jobDescriptionId` as required by `JobDescriptionSelectField`, leave it — the schema permits an empty string, and the field component itself accepts `""` as value (matches the interview create flow).

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(auth)/w/[slug]/studio/resumes/_components/upload-resume-dialog.tsx'
git commit -m "feat(resumes): add upload resume dialog"
```

---

## Task 12: Edit resume dialog

**Files:**

- Create: `src/app/(auth)/w/[slug]/studio/resumes/_components/edit-resume-dialog.tsx`

Mirrors the upload dialog but loads the existing record into the form and PATCHes.

- [ ] **Step 1: Create the dialog**

```ts
"use client";

import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { useStore } from "@tanstack/react-form";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { FileUpIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { JobDescriptionSelectField } from "@/app/(auth)/w/[slug]/studio/interviews/_components/job-description-select-field";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { apiFetch, fetchStudioResume } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  createResumeLibraryFormValues,
  resumeLibraryFormSchema,
} from "@/lib/shared/studio-resumes";

interface FieldErrorLike {
  message?: string;
}

function toFieldErrors(errors: unknown[] | undefined): FieldErrorLike[] | undefined {
  // oxlint-disable-next-line promise/prefer-await-to-callbacks
  const mapped = (errors ?? []).flatMap((err) => {
    if (!err) return [];
    if (typeof err === "string") return [{ message: err }];
    if (typeof err === "object" && "message" in err) {
      const message = typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : undefined;
      return [{ message }];
    }
    return [];
  });
  return mapped.length > 0 ? mapped : undefined;
}

interface EditResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string | null;
  onUpdated: (detail: ResumeLibraryDetail) => void;
}

export function EditResumeDialog({
  open,
  onOpenChange,
  recordId,
  onUpdated,
}: EditResumeDialogProps) {
  const slug = useWorkspaceSlug();
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const query = useQuery({
    enabled: open && Boolean(recordId),
    queryFn: () => fetchStudioResume(slug, recordId as string),
    queryKey: ["studio-resumes", slug, "edit-detail", recordId] as const,
    staleTime: 0,
  });

  const form = useForm({
    defaultValues: createResumeLibraryFormValues(),
    onSubmit: async ({ value }) => {
      if (!recordId) return;
      const formData = new FormData();
      formData.append("candidateName", value.candidateName);
      formData.append("candidateEmail", value.candidateEmail);
      formData.append("candidatePhone", value.candidatePhone);
      formData.append("targetRole", value.targetRole);
      formData.append("jobDescriptionId", value.jobDescriptionId);
      formData.append("notes", value.notes);
      if (resumeFile) {
        formData.append("resume", resumeFile);
      }

      try {
        const detail = await apiFetch<ResumeLibraryDetail>(
          `/api/w/${slug}/studio/resumes/${recordId}`,
          { body: formData, method: "PATCH" },
          "保存失败",
        );
        toast.success("已保存");
        onUpdated(detail);
        onOpenChange(false);
        setResumeFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    },
    validators: { onSubmit: resumeLibraryFormSchema },
  });

  // Hydrate form when detail loads.
  useEffect(() => {
    if (!query.data) return;
    form.reset({
      candidateEmail: query.data.candidateEmail ?? "",
      candidateName: query.data.candidateName,
      candidatePhone: query.data.candidatePhone ?? "",
      jobDescriptionId: query.data.jobDescriptionId ?? "",
      notes: query.data.notes ?? "",
      targetRole: query.data.targetRole ?? "",
    });
    // form is stable across renders; we depend on query.data identity only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

  return (
    <Modal onOpenChange={onOpenChange} open={open} title="编辑简历" size="md">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Field>
          <FieldLabel htmlFor="resume-upload-edit">替换简历 PDF（可选）</FieldLabel>
          <FieldContent className="gap-2">
            <label
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 border-dashed px-3 py-3 text-sm transition-colors hover:border-border"
              htmlFor="resume-upload-edit"
            >
              <FileUpIcon className="size-4" />
              <span>
                {resumeFile
                  ? resumeFile.name
                  : query.data?.resumeFileName
                    ? `当前：${query.data.resumeFileName}`
                    : "未上传 PDF，点击选择文件"}
              </span>
            </label>
            <input
              accept="application/pdf"
              className="sr-only"
              id="resume-upload-edit"
              onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
              ref={fileInputRef}
              type="file"
            />
          </FieldContent>
        </Field>

        <form.Field name="jobDescriptionId">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <JobDescriptionSelectField
                error={errors?.[0]?.message}
                onChange={(next) => field.handleChange(next)}
                value={field.state.value ?? ""}
              />
            );
          }}
        </form.Field>

        <FieldGroup className="grid gap-5 md:grid-cols-2 md:items-start">
          {(["candidateName", "candidateEmail", "candidatePhone", "targetRole"] as const).map(
            (name) => (
              <form.Field key={name} name={name}>
                {(field) => {
                  const errors = toFieldErrors(field.state.meta.errors);
                  const labels = {
                    candidateEmail: "候选人邮箱",
                    candidateName: "候选人姓名",
                    candidatePhone: "联系电话",
                    targetRole: "目标岗位",
                  } as const;
                  const maxLengths = {
                    candidateEmail: 200,
                    candidateName: 120,
                    candidatePhone: 40,
                    targetRole: 120,
                  } as const;
                  return (
                    <Field>
                      <FieldLabel htmlFor={field.name}>{labels[name]}</FieldLabel>
                      <FieldContent className="gap-2">
                        <Input
                          id={field.name}
                          maxLength={maxLengths[name]}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                        <FieldError errors={errors} />
                      </FieldContent>
                    </Field>
                  );
                }}
              </form.Field>
            ),
          )}
        </FieldGroup>

        <form.Field name="notes">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <Field>
                <FieldLabel htmlFor={field.name}>备注</FieldLabel>
                <FieldContent className="gap-2">
                  <div className="relative">
                    <Textarea
                      className="min-h-24 pb-6"
                      id={field.name}
                      maxLength={2000}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      rows={4}
                      value={field.state.value}
                    />
                    <TextareaCounter maxLength={2000} value={field.state.value} />
                  </div>
                  <FieldError errors={errors} />
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
            保存
          </Button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(auth)/w/[slug]/studio/resumes/_components/edit-resume-dialog.tsx'
git commit -m "feat(resumes): add edit resume dialog"
```

---

## Task 13: Main library page

**Files:**

- Create: `src/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page.tsx`

- [ ] **Step 1: Create the page component**

```ts
"use client";

import type { ResumeLibraryListRecord, PaginatedResumeLibraryResult } from "@/lib/shared/studio-resumes";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { BotIcon, EyeIcon, PencilIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/app/(auth)/w/[slug]/studio/_components/page-header";
import { JobDescriptionViewDialog } from "@/app/(auth)/w/[slug]/studio/interviews/_components/job-description-view-dialog";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  dateColumn,
  selectColumn,
  textColumn,
  useDataGridState,
} from "@/components/data-grid";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  bulkDeleteStudioResumes,
  deleteStudioResume,
  fetchStudioResumes,
} from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { EditResumeDialog } from "./edit-resume-dialog";
import { ResumeDetailDialog } from "./resume-detail-dialog";
import { UploadResumeDialog } from "./upload-resume-dialog";

const PdfPreviewDialog = dynamic(
  async () => {
    const mod = await import("@/components/pdf-preview-dialog");
    return mod.PdfPreviewDialog;
  },
  { ssr: false },
);

interface FetchParams {
  page: number;
  pageSize: number;
  search: string;
  filters: Record<string, never>;
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}

export function ResumeLibraryPage({ initialData }: { initialData: PaginatedResumeLibraryResult }) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();

  const fetcher = useMemo(
    () =>
      (params: FetchParams): Promise<PaginatedResumeLibraryResult> =>
        fetchStudioResumes(slug, {
          page: params.page,
          pageSize: params.pageSize,
          search: params.search || undefined,
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
        }),
    [slug],
  );

  const grid = useDataGridState<ResumeLibraryListRecord, Record<string, never>>({
    defaultSorting: [{ desc: true, id: "createdAt" }],
    fetcher,
    initialData,
    initialFilters: {},
    namespace: "studio-resumes",
  });

  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<ResumeLibraryListRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<ResumeLibraryListRecord | null>(null);
  const [viewJobDescriptionId, setViewJobDescriptionId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
  }

  function startAiInterview(record: ResumeLibraryListRecord) {
    router.push(`/w/${slug}/studio/interviews?recordId=${record.id}`);
  }

  const columns = useMemo(
    () => [
      selectColumn<ResumeLibraryListRecord>(),
      customColumn<ResumeLibraryListRecord>({
        cell: (r) => (
          <div className="min-w-0">
            <button
              className="block max-w-full cursor-pointer truncate text-left font-medium underline-offset-4 hover:underline"
              onClick={() => setDetailRecordId(r.id)}
              type="button"
            >
              {r.candidateName}
            </button>
            {r.candidateEmail ? (
              <a
                className="block max-w-full truncate text-muted-foreground text-xs underline-offset-4 hover:underline"
                href={`mailto:${r.candidateEmail}`}
                onClick={(e) => e.stopPropagation()}
              >
                {r.candidateEmail}
              </a>
            ) : (
              <p className="truncate text-muted-foreground text-xs">未填写邮箱</p>
            )}
          </div>
        ),
        key: "candidateName",
        size: 200,
        title: "候选人",
      }),
      textColumn<ResumeLibraryListRecord>({
        cell: (r) => r.targetRole || "—",
        key: "targetRole",
        title: "目标岗位",
      }),
      customColumn<ResumeLibraryListRecord>({
        cell: (r) =>
          r.jobDescriptionName ? (
            <button
              className="cursor-pointer truncate text-left underline-offset-4 hover:underline"
              onClick={() => r.jobDescriptionId && setViewJobDescriptionId(r.jobDescriptionId)}
              type="button"
            >
              {r.jobDescriptionName}
            </button>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        key: "jobDescriptionName",
        title: "关联岗位",
      }),
      customColumn<ResumeLibraryListRecord>({
        cell: (r) => {
          const label = r.resumeFileName || "手动创建";
          if (!r.hasResumeFile) {
            return (
              <div
                aria-disabled
                className="max-w-48 cursor-not-allowed truncate text-sm opacity-50"
                title="暂无简历 PDF"
              >
                {label}
              </div>
            );
          }
          return (
            <button
              className="block max-w-48 cursor-pointer truncate text-left text-sm underline-offset-4 hover:underline"
              onClick={() => setPreviewRecord(r)}
              type="button"
            >
              {label}
            </button>
          );
        },
        key: "resumeFileName",
        title: "简历文件",
      }),
      textColumn<ResumeLibraryListRecord>({
        cell: (r) => r.creatorName ?? "—",
        key: "creatorName",
        title: "创建人",
      }),
      textColumn<ResumeLibraryListRecord>({
        cell: (r) => r.creatorOrganizationName ?? "—",
        key: "creatorOrganizationName",
        title: "创建人组织",
      }),
      dateColumn<ResumeLibraryListRecord>({
        key: "createdAt",
        sortable: true,
        title: "创建时间",
      }),
      actionsColumn<ResumeLibraryListRecord>({
        inline: [
          { icon: EyeIcon, label: "查看详情", onClick: (r) => setDetailRecordId(r.id) },
          { icon: PencilIcon, label: "编辑", onClick: (r) => setEditRecordId(r.id) },
        ],
        menu: [
          { icon: BotIcon, label: "发起 AI 面试", onClick: startAiInterview },
          {
            icon: Trash2Icon,
            label: "删除",
            onClick: (r) => setDeleteRecord(r),
            variant: "destructive",
          },
        ],
      }),
    ],
    [],
  );

  const filtersConfig = useMemo(
    () => [
      {
        key: "search" as const,
        minWidth: "15rem",
        placeholder: "搜索候选人、邮箱、电话、简历名或目标岗位",
        type: "search" as const,
      },
    ],
    [],
  );

  async function handleDelete() {
    if (!deleteRecord) return;
    try {
      await deleteStudioResume(slug, deleteRecord.id);
      setDeleteRecord(null);
      toast.success("简历已删除");
      invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function handleBulkDelete() {
    const ids = Object.keys(grid.rowSelection).filter((id) => grid.rowSelection[id]);
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    try {
      const result = await bulkDeleteStudioResumes(slug, ids);
      toast.success(`已删除 ${result.deleted ?? ids.length} 条记录`);
      grid.setRowSelection({});
      setBulkDeleteOpen(false);
      invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量删除失败");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="简历库"
          description="集中管理所有候选人简历。在这里上传 PDF 不会自动生成面试题，需要时再发起 AI 面试。"
        />
        <DataGrid<ResumeLibraryListRecord>
          {...grid.bind}
          columns={columns}
          getRowId={(r) => r.id}
          columnPinning={{ left: ["select", "candidateName"], right: ["actions"] }}
          filters={filtersConfig}
          toolbarRight={<UploadResumeDialog onCreated={() => invalidateAll()} />}
          bulkActions={({ selectedIds }) => (
            <Button
              className="flex-1 sm:flex-none"
              onClick={() => setBulkDeleteOpen(true)}
              variant="destructive"
            >
              <Trash2Icon className="size-4" />
              批量删除 ({selectedIds.length})
            </Button>
          )}
          empty={
            <Empty className="border-border/60">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon className="size-5" />
                </EmptyMedia>
                <EmptyTitle>简历库还没有任何候选人</EmptyTitle>
                <EmptyDescription>
                  点击右上角「上传简历」加入第一份候选人简历。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <UploadResumeDialog onCreated={() => invalidateAll()} />
              </EmptyContent>
            </Empty>
          }
        />
      </div>

      <ResumeDetailDialog
        onEdit={(id) => {
          setDetailRecordId(null);
          setEditRecordId(id);
        }}
        onOpenChange={(open) => !open && setDetailRecordId(null)}
        open={detailRecordId !== null}
        recordId={detailRecordId}
      />

      <EditResumeDialog
        onOpenChange={(open) => !open && setEditRecordId(null)}
        onUpdated={() => invalidateAll()}
        open={editRecordId !== null}
        recordId={editRecordId}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteRecord(null)}
        open={deleteRecord !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这条简历？</AlertDialogTitle>
            <AlertDialogDescription>
              将一并删除该候选人下所有关联数据（包括已发起的 AI 面试轮次与对话记录）。当前记录：
              {deleteRecord?.candidateName ?? "未知候选人"}。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} variant="destructive">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={setBulkDeleteOpen} open={bulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              确认批量删除{" "}
              {Object.keys(grid.rowSelection).filter((id) => grid.rowSelection[id]).length} 条简历？
            </AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可恢复。所选记录及其关联面试数据将一并级联删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBulkDeleting}
              onClick={(e) => {
                e.preventDefault();
                void handleBulkDelete();
              }}
              variant="destructive"
            >
              {isBulkDeleting ? "正在删除…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previewRecord ? (
        <PdfPreviewDialog
          filename={previewRecord.resumeFileName ?? undefined}
          onOpenChange={(open) => !open && setPreviewRecord(null)}
          open={previewRecord !== null}
          url={`/api/w/${slug}/studio/resumes/${previewRecord.id}/resume`}
        />
      ) : null}

      <JobDescriptionViewDialog
        jobDescriptionId={viewJobDescriptionId}
        onOpenChange={(open) => !open && setViewJobDescriptionId(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page.tsx'
git commit -m "feat(resumes): add resume library page"
```

---

## Task 14: SSR page entry

**Files:**

- Create: `src/app/(auth)/w/[slug]/studio/resumes/page.tsx`

- [ ] **Step 1: Create the entry**

```ts
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ResumeLibraryPage } from "@/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page";
import { resolveActiveOrganization } from "@/lib/server/auth-session";
import { listResumeRecords } from "@/server/routes/studio/routes/resumes/dao/resumes";

export const metadata: Metadata = {
  title: "简历库",
};

export default async function StudioResumesPage() {
  await connection();
  const activeOrg = await resolveActiveOrganization();
  if (!activeOrg) {
    notFound();
  }
  const initialData = await listResumeRecords(activeOrg.id);
  return <ResumeLibraryPage initialData={initialData} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(auth)/w/[slug]/studio/resumes/page.tsx'
git commit -m "feat(resumes): add SSR page entry"
```

---

## Task 15: Verify end-to-end

**Files:** None modified — this is a verification gate.

- [ ] **Step 1: Lint / format**

Run: `pnpm fix`

Expected: no errors, only autoformatting if anything.

- [ ] **Step 2: Full type check**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test --run`

Expected: PASS. New tests (`dao.test.ts`, `route.test.ts`) pass; all existing tests still pass.

- [ ] **Step 4: Manual smoke (golden path)**

Start the dev server: `pnpm dev` (in another terminal).

In the browser, signed in to a workspace:

1. Open the studio sidebar — "工作台" group shows `AI 面试` and a new `简历库` entry. Confirmed presence.
2. Click `简历库` — list page loads. Existing studio interviews show up in the table without the 状态 / 当前轮次 / 题目数 / 复制面试链接 columns.
3. Click `上传简历` — dialog opens. Pick a PDF, leave name blank, click `确认上传`. Toast `简历已加入简历库` appears; new row in the table; candidate name is the LLM-parsed name.
4. Click the candidate name — detail dialog shows basic info, the 结构化简历 section, and a `预览 PDF` button. No interview-round / 面试题 / 报告 sections visible.
5. Click `发起 AI 面试` in the detail dialog — navigates to `/w/<slug>/studio/interviews?recordId=<id>` and the existing interview detail dialog opens automatically on that record.
6. Go back to 简历库, edit a record, change `备注`, save. Toast `已保存`; the row updates.
7. Delete a record from the row menu; confirm toast and row disappearance.
8. Re-open AI 面试 page — newly created resume-library records also appear there (since they share the table) with `状态 = draft`, `题目数 = 0`, `当前轮次 = 未安排`.

- [ ] **Step 5: Stop the dev server.**

- [ ] **Step 6: Optional final commit if `pnpm fix` produced any changes**

```bash
git status
# if there are changes from autoformatting:
git add -A
git commit -m "chore: ultracite autoformat"
```
