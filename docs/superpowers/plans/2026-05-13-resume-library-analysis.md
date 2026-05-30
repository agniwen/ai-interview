# Resume Library Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将简历库「上传简历」对话框升级为「新建简历记录」对话框，接入 AI 面试同款流式解析 / JD 匹配 / 查重 / 出题流水线，并新增「保存 / 保存并发起面试」双按钮（后者自动创建 1 条默认面试轮次）。

**Architecture:** 抽 `useResumeAnalysisPipeline` hook + `<ResumeAnalysisOverlay>` 共享组件，简历库与 AI 面试两边复用。简历库新增的「保存并发起面试」路径前端复用 `POST /api/w/:slug/studio/interviews`（后端零改动）；「保存」路径走 `POST /api/w/:slug/studio/resumes`（后端新增 `resumePayload` 字段）。

**Tech Stack:** Next.js 16 App Router、TanStack Form、Hono RPC、Drizzle ORM、Vitest（jsdom + 真实 DB 集成测试）。

---

## Locked decisions (from spec Open Items)

1. **「保存并发起面试」后不跳转** AI 面试详情页 —— 列表 prepend + toast 即可
2. **默认 `scheduledAt = ""`**（schema 接受空串，DB 列 nullable，落库语义为「未排期」）—— 已确认 `studioInterviewSchedule.scheduledAt: timestamp("scheduled_at")` 无 `.notNull()`
3. **不内嵌** `<InterviewScheduleFields>` 到简历库弹窗
4. **默认 roundLabel = "一面"** —— 复用现有 `createDefaultScheduleEntry()` 工厂（spec 中提的「初轮」改为「一面」对齐既有约定）
5. **「保存并发起面试」按钮在 `jobDescriptionId` 为空时禁用** —— `studioInterviewFormSchema` 强制要求 JD，前端先卡住
6. **`fetchResumeDedup` / `/studio/resumes/dedup-check` 路由保留** 不在本次清理范围
7. **后端 `/studio/interviews` POST 完全不动** —— `parseResumePayloadInput` / `parseScheduleEntriesInput` 已在 `src/lib/shared/studio-interviews.ts` 实现

---

## File map

### 新增

- `src/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline.ts` — 简历解析流水线 hook
- `src/app/(auth)/w/[slug]/studio/_components/resume-analysis-overlay.tsx` — 流式进度浮层
- `src/app/(auth)/w/[slug]/studio/_components/__tests__/use-resume-analysis-pipeline.test.ts` — hook 单测
- `src/server/routes/studio/routes/resumes/__tests__/route-resume-payload.test.ts` — 后端 resumePayload 集成测试

### 修改

- `src/lib/shared/studio-resumes.ts` — `ResumeLibraryDetail` 增 `interviewQuestions`
- `src/server/routes/studio/routes/resumes/dao/resumes.ts` — `loadResumeDetail` 拉 `interviewQuestions`
- `src/server/routes/studio/routes/resumes/route.ts` — POST handler 接收 `resumePayload`
- `src/app/(auth)/w/[slug]/studio/interviews/_components/create-interview-dialog.tsx` — 重构消费 hook + overlay
- `src/app/(auth)/w/[slug]/studio/resumes/_components/upload-resume-dialog.tsx` — 重写为 `CreateResumeRecordDialog`，双 submit
- `src/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page.tsx` — 处理 union `onCreated` 结果
- `src/app/(auth)/w/[slug]/studio/_components/studio-person-detail-dialog.tsx` — resume 模式 questions tab

---

## Phase 1 — Backend foundations

### Task 1: ResumeLibraryDetail 增加 interviewQuestions 字段

**Files:**

- Modify: `src/lib/shared/studio-resumes.ts:37-39`
- Modify: `src/server/routes/studio/routes/resumes/dao/resumes.ts:170-194`

- [ ] **Step 1: 给 `ResumeLibraryDetail` 加字段**

Open `src/lib/shared/studio-resumes.ts`. Add `ResumeAnalysisResult` import and extend the type:

```ts
import { z } from "zod";
import type { ResumeAnalysisResult } from "@/lib/shared/interview/types";
import type { ResumeProfile } from "@/lib/shared/interview/types";

// ... ResumeLibraryListRecord unchanged ...

/**
 * 单条详情 DTO：列表字段 + resumeProfile 结构化简历 + interviewQuestions。
 *
 * Detail DTO: list fields plus the structured `resumeProfile` and any
 * `interviewQuestions` generated during upload (may be empty for legacy rows).
 */
export interface ResumeLibraryDetail extends ResumeLibraryListRecord {
  resumeProfile: ResumeProfile | null;
  interviewQuestions: ResumeAnalysisResult["interviewQuestions"];
}
```

- [ ] **Step 2: DAO 同时拉 `interviewQuestions`**

Edit `src/server/routes/studio/routes/resumes/dao/resumes.ts` `loadResumeDetail`:

```ts
export async function loadResumeDetail(
  id: string,
  organizationId: string,
): Promise<ResumeLibraryDetail | null> {
  const [row] = await db
    .select({
      ...SELECTED_COLUMNS,
      resumeProfile: studioInterview.resumeProfile,
      interviewQuestions: studioInterview.interviewQuestions,
    })
    .from(studioInterview)
    .leftJoin(user, eq(studioInterview.createdBy, user.id))
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const { resumeProfile, interviewQuestions, ...rest } = row;
  return {
    ...toRecord(rest),
    resumeProfile,
    interviewQuestions: interviewQuestions ?? [],
  };
}
```

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: commit**

```bash
git add src/lib/shared/studio-resumes.ts src/server/routes/studio/routes/resumes/dao/resumes.ts
git commit -m "feat(resumes): surface interviewQuestions in ResumeLibraryDetail"
```

---

### Task 2: POST /studio/resumes 接收 resumePayload（红 → 绿）

**Files:**

- Test: `src/server/routes/studio/routes/resumes/__tests__/route-resume-payload.test.ts` (new)
- Modify: `src/server/routes/studio/routes/resumes/route.ts:159-228`

- [ ] **Step 1: 写失败的集成测试**

Create `src/server/routes/studio/routes/resumes/__tests__/route-resume-payload.test.ts`:

```ts
// Verify POST /studio/resumes accepts a client-prebaked resumePayload and
// stores interviewQuestions on the row. Mirrors the dao.test.ts setup.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { member, organization, studioInterview, user } from "@/lib/shared/db/schema";
import { loadResumeDetail } from "@/server/routes/studio/routes/resumes/dao/resumes";

const ORG = "test_org_resume_payload";
const USER_ID = "test_user_resume_payload";
const NOW = new Date("2026-05-13T12:00:00.000Z");

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
    email: "resume-payload@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "rp",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG,
    name: "Org Payload",
    slug: "test-resume-payload",
  });
  await db.insert(member).values({
    createdAt: NOW,
    id: "m_rp",
    organizationId: ORG,
    role: "owner",
    userId: USER_ID,
  });
});

afterAll(cleanup);

describe("POST /studio/resumes resumePayload", () => {
  it("stores interviewQuestions when resumePayload is provided", async () => {
    // Insert a row manually using the same writer path the handler will use
    // once Step 2 lands. We assert that loadResumeDetail surfaces questions.
    const recordId = "rp-with-questions";
    await db.insert(studioInterview).values({
      candidateName: "郭靖",
      createdAt: NOW,
      createdBy: USER_ID,
      id: recordId,
      interviewQuestions: [
        { difficulty: "easy", order: 1, question: "自我介绍" },
        { difficulty: "medium", order: 2, question: "项目难点" },
      ],
      organizationId: ORG,
      resumeProfile: { name: "郭靖", targetRoles: [] },
      status: "draft",
      updatedAt: NOW,
    });

    const detail = await loadResumeDetail(recordId, ORG);
    expect(detail).not.toBeNull();
    expect(detail?.interviewQuestions).toHaveLength(2);
    expect(detail?.interviewQuestions[0]?.question).toBe("自我介绍");
  });

  it("returns empty interviewQuestions for legacy rows without the field", async () => {
    const recordId = "rp-no-questions";
    await db.insert(studioInterview).values({
      candidateName: "李四",
      createdAt: NOW,
      createdBy: USER_ID,
      id: recordId,
      interviewQuestions: [],
      organizationId: ORG,
      status: "draft",
      updatedAt: NOW,
    });

    const detail = await loadResumeDetail(recordId, ORG);
    expect(detail?.interviewQuestions).toEqual([]);
  });
});
```

> Note: This test pins `loadResumeDetail` behavior with raw rows. The handler-level assertion (POST → DB round-trip) is left as a manual e2e check in Phase 5 — exercising the full route stack here requires faking auth middleware, which `route.test.ts` already acknowledges is heavyweight.

- [ ] **Step 2: 运行测试，确认 Task 1 已让它通过**

Run: `pnpm test src/server/routes/studio/routes/resumes/__tests__/route-resume-payload.test.ts`
Expected: PASS (Task 1 已让 DAO 暴露 `interviewQuestions`)

> 如果 Task 1 没合，这里会 FAIL。

- [ ] **Step 3: 修改 route.ts POST handler**

Edit `src/server/routes/studio/routes/resumes/route.ts`:

1. Add import:

```ts
import { parseResumePayloadInput } from "@/lib/shared/studio-interviews";
```

2. Replace the parse / insert block inside `.post("/", requirePermission("resume", "create"), …)` (currently `route.ts:159-228`). The new body:

```ts
.post("/", requirePermission("resume", "create"), async (c) => {
  const { activeOrg } = c.var;
  if (!activeOrg) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  try {
    const formData = await c.req.formData();
    const resume = normalizeResumeFile(formData.get("resume"));
    const parsedResumePayload = parseResumePayloadInput(formData.get("resumePayload"));

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

    // Reuse order: client-prebaked payload → registry cache → server fallback parse.
    // Questions are NEVER generated server-side here; if the client didn't ship a
    // resumePayload, the row stores an empty interviewQuestions array (same as legacy).
    // 客户端预制 payload > 注册表缓存 > 现场兜底解析。服务端从不补跑题目生成。
    let resumeProfile = parsedResumePayload?.resumeProfile ?? uploadResult?.cachedResumeProfile ?? null;
    let parsedFileName: string | null =
      parsedResumePayload?.fileName ?? (resume?.name ?? null);
    if (resume && !resumeProfile) {
      const parsed = await parseResumeFastToProfile(resume);
      ({ resumeProfile } = parsed);
      parsedFileName = resume.name;
    }

    const row = {
      candidateEmail: input.data.candidateEmail || null,
      candidateName: input.data.candidateName || resumeProfile?.name || "未命名候选人",
      candidatePhone: input.data.candidatePhone || resumeProfile?.phone || null,
      createdAt: now,
      createdBy: c.var.user?.id ?? null,
      id: recordId,
      interviewQuestions: parsedResumePayload?.interviewQuestions ?? [],
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
```

- [ ] **Step 4: 跑整套 resumes 测试**

Run: `pnpm test src/server/routes/studio/routes/resumes/__tests__/`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/server/routes/studio/routes/resumes/route.ts src/server/routes/studio/routes/resumes/__tests__/route-resume-payload.test.ts
git commit -m "feat(resumes): accept resumePayload to persist interviewQuestions"
```

---

## Phase 2 — Shared analysis pipeline

### Task 3: 编写 useResumeAnalysisPipeline hook + 单测（红）

**Files:**

- Test: `src/app/(auth)/w/[slug]/studio/_components/__tests__/use-resume-analysis-pipeline.test.ts` (new)
- Create: `src/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline.ts` (stub only)

- [ ] **Step 1: 写 hook 类型骨架（让测试可编译）**

Create `src/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline.ts`:

```ts
"use client";

// 简历分析流水线 hook：parse → JD 匹配 → 身份查重 → 出题。
// 简历库与 AI 面试两个新建入口共用。组件层只负责回填表单 / 渲染 overlay；
// 所有 NDJSON 流式解析、abortController、状态机都封装在这里。
//
// Resume analysis pipeline hook shared by the resume library and AI interview
// create dialogs. Owns parse → JD match → dedup → questions state and all
// abort/stream plumbing; consumers wire callbacks and render the overlay.

import type { DedupMatchRecord } from "@/lib/client/api";
import type {
  InterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@/lib/shared/interview/types";

export interface ResumeAnalysisPipelineOptions {
  onProfileParsed: (input: { fileName: string; resumeProfile: ResumeProfile }) => void;
  onJobDescriptionMatched: (matchedId: string, reason: string | null) => void;
  onQuestionsGenerated: (questions: InterviewQuestion[]) => void;
}

export interface ResumeAnalysisPipelineState {
  isAnalyzingResume: boolean;
  isGeneratingQuestions: boolean;
  progressStatus: string;
  progressTools: { name: string; done: boolean }[];
  partialFields: { label: string; value: string }[];
  dedupMatches: DedupMatchRecord[] | null;
  resumePayload: ResumeAnalysisResult | null;
  resumeFile: File | null;
  isBusy: boolean;
}

export interface ResumeAnalysisPipelineHandlers {
  handleResumeChange: (file: File | null) => Promise<void>;
  handleDedupContinue: () => void;
  handleCancelAnalysis: () => void;
  reset: () => void;
}

export type ResumeAnalysisPipeline = ResumeAnalysisPipelineState & ResumeAnalysisPipelineHandlers;

export function useResumeAnalysisPipeline(
  _options: ResumeAnalysisPipelineOptions,
): ResumeAnalysisPipeline {
  throw new Error("useResumeAnalysisPipeline: not yet implemented");
}
```

- [ ] **Step 2: 写失败的单测**

Create `src/app/(auth)/w/[slug]/studio/_components/__tests__/use-resume-analysis-pipeline.test.ts`:

```ts
// jsdom-flavoured tests for the analysis pipeline hook. We mock fetch and the
// rpc helpers so we can drive the state machine deterministically. The point
// is to lock in the callback contract — what triggers each callback and in
// what order — not to verify the on-wire NDJSON parsing (that lives in
// readNdjsonStream's own tests).

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@/lib/shared/interview/types";

const FILE = new File(["%PDF-1.4"], "alice.pdf", { type: "application/pdf" });

const SAMPLE_PROFILE: ResumeProfile = {
  name: "Alice",
  email: "alice@example.com",
  phone: "13800000000",
  targetRoles: ["frontend"],
  // Add any other required fields with sensible defaults per ResumeProfile schema.
};

// Mock helpers used by the hook.
vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "test-slug",
}));

vi.mock("@/lib/client/api", () => ({
  fetchInterviewDedup: vi.fn(async () => ({ matches: [] })),
}));

vi.mock("@/lib/client/rpc", () => ({
  rpc: {
    api: {
      interview: {
        "match-job-description": {
          $post: vi.fn(async () => ({
            ok: true,
            json: async () => ({ matchedId: null, reason: null }),
          })),
        },
      },
    },
  },
}));

// We stub readNdjsonStream to immediately drive Step 1 + Step 2 events.
vi.mock("@/lib/client/ndjson-stream", () => ({
  readNdjsonStream: vi.fn(),
}));

import { useResumeAnalysisPipeline } from "../use-resume-analysis-pipeline";
import { fetchInterviewDedup } from "@/lib/client/api";
import { readNdjsonStream } from "@/lib/client/ndjson-stream";

const QUESTIONS = [{ difficulty: "easy" as const, order: 1, question: "Tell me about yourself" }];

function stubParseResponse() {
  return new Response(JSON.stringify({}), { status: 200 });
}

function stubGenerateResponse() {
  return new Response(JSON.stringify({}), { status: 200 });
}

describe("useResumeAnalysisPipeline", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy
      .mockResolvedValueOnce(stubParseResponse()) // parse-resume
      .mockResolvedValueOnce(stubGenerateResponse()); // generate-questions

    vi.mocked(readNdjsonStream).mockImplementation(async (_response, onEvent) => {
      // First call drives parse-resume result.
      if ((readNdjsonStream as any).mock.calls.length === 1) {
        onEvent({
          type: "result",
          data: { fileName: FILE.name, resumeProfile: SAMPLE_PROFILE },
        } as any);
        return;
      }
      // Second call drives generate-questions result.
      onEvent({ type: "result", data: { interviewQuestions: QUESTIONS } } as any);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it("invokes onProfileParsed after Step 1", async () => {
    const onProfileParsed = vi.fn();
    const onJobDescriptionMatched = vi.fn();
    const onQuestionsGenerated = vi.fn();

    const { result } = renderHook(() =>
      useResumeAnalysisPipeline({
        onProfileParsed,
        onJobDescriptionMatched,
        onQuestionsGenerated,
      }),
    );

    await act(async () => {
      await result.current.handleResumeChange(FILE);
    });

    expect(onProfileParsed).toHaveBeenCalledWith({
      fileName: FILE.name,
      resumeProfile: SAMPLE_PROFILE,
    });
    expect(result.current.resumePayload?.resumeProfile).toEqual(SAMPLE_PROFILE);
  });

  it("invokes onQuestionsGenerated after Step 2 when no dedup hit", async () => {
    const onQuestionsGenerated = vi.fn();
    const { result } = renderHook(() =>
      useResumeAnalysisPipeline({
        onProfileParsed: vi.fn(),
        onJobDescriptionMatched: vi.fn(),
        onQuestionsGenerated,
      }),
    );

    await act(async () => {
      await result.current.handleResumeChange(FILE);
    });

    expect(onQuestionsGenerated).toHaveBeenCalledWith(QUESTIONS);
    expect(result.current.resumePayload?.interviewQuestions).toEqual(QUESTIONS);
  });

  it("pauses on dedup hit and resumes via handleDedupContinue", async () => {
    vi.mocked(fetchInterviewDedup).mockResolvedValueOnce({
      matches: [{ id: "dup-1" } as any],
    });

    const onQuestionsGenerated = vi.fn();
    const { result } = renderHook(() =>
      useResumeAnalysisPipeline({
        onProfileParsed: vi.fn(),
        onJobDescriptionMatched: vi.fn(),
        onQuestionsGenerated,
      }),
    );

    await act(async () => {
      await result.current.handleResumeChange(FILE);
    });

    // After dedup hit, Step 2 must NOT have run yet.
    expect(onQuestionsGenerated).not.toHaveBeenCalled();
    expect(result.current.dedupMatches?.length).toBe(1);

    // Continue → drives Step 2 (uses the second fetch stub which we reset).
    fetchSpy.mockResolvedValueOnce(stubGenerateResponse());
    vi.mocked(readNdjsonStream).mockImplementationOnce(async (_response, onEvent) => {
      onEvent({ type: "result", data: { interviewQuestions: QUESTIONS } } as any);
    });

    await act(async () => {
      result.current.handleDedupContinue();
      // allow microtasks to flush
      await Promise.resolve();
    });

    expect(onQuestionsGenerated).toHaveBeenCalledWith(QUESTIONS);
  });
});
```

> The mock plumbing is deliberately permissive (`as any` on stream events) — these tests pin **callback ordering and resumePayload shape**, not the NDJSON event schema. The full event handling stays under hand-tested integration in Phase 5.

- [ ] **Step 3: 运行测试，确认全部 FAIL**

Run: `pnpm test src/app/\(auth\)/w/\[slug\]/studio/_components/__tests__/use-resume-analysis-pipeline.test.ts`
Expected: 3 tests FAIL with "useResumeAnalysisPipeline: not yet implemented"

- [ ] **Step 4: commit (red 阶段)**

```bash
git add src/app/\(auth\)/w/\[slug\]/studio/_components/use-resume-analysis-pipeline.ts \
        src/app/\(auth\)/w/\[slug\]/studio/_components/__tests__/use-resume-analysis-pipeline.test.ts
git commit -m "test(studio): pin useResumeAnalysisPipeline contract (red)"
```

---

### Task 4: 实现 useResumeAnalysisPipeline（绿）

**Files:**

- Modify: `src/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline.ts`

- [ ] **Step 1: 实现 hook**

Replace the stub. The implementation mirrors the existing logic in `create-interview-dialog.tsx` (which currently lives at lines ~50-528). Move the following pieces verbatim into the hook:

- `LEADING_DIGIT_RE`, `LEADING_DIGITS_RE` module constants
- `tryExtractPartialFields` function
- `handleStreamEvent` function
- All `useState` declarations for `resumeFile`, `resumePayload`, `isAnalyzingResume`, `isGeneratingQuestions`, `progressStatus`, `progressTools`, `partialFields`, `dedupMatches`
- All `useRef` declarations: `accumulatedTextRef`, `abortControllerRef`, `pendingProfileRef`
- The async functions `runQuestionGeneration`, `handleResumeChange`, `handleDedupContinue`, `handleCancelAnalysis`
- The `reset` helper (equivalent to `resetTransientDialogState` minus the file-input DOM reset — leave that to the caller)

The hook body:

```ts
"use client";

import type { DedupMatchRecord } from "@/lib/client/api";
import { fetchInterviewDedup } from "@/lib/client/api";
import { readNdjsonStream } from "@/lib/client/ndjson-stream";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { AnalysisStreamEvent } from "@/lib/shared/api-stream";
import type {
  InterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@/lib/shared/interview/types";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

const LEADING_DIGIT_RE = /^\d/;
const LEADING_DIGITS_RE = /^(\d+)/;

// Public types (re-declared for export).
export interface ResumeAnalysisPipelineOptions {
  onProfileParsed: (input: { fileName: string; resumeProfile: ResumeProfile }) => void;
  onJobDescriptionMatched: (matchedId: string, reason: string | null) => void;
  onQuestionsGenerated: (questions: InterviewQuestion[]) => void;
}

export interface ResumeAnalysisPipelineState {
  isAnalyzingResume: boolean;
  isGeneratingQuestions: boolean;
  progressStatus: string;
  progressTools: { name: string; done: boolean }[];
  partialFields: { label: string; value: string }[];
  dedupMatches: DedupMatchRecord[] | null;
  resumePayload: ResumeAnalysisResult | null;
  resumeFile: File | null;
  isBusy: boolean;
}

export interface ResumeAnalysisPipelineHandlers {
  handleResumeChange: (file: File | null) => Promise<void>;
  handleDedupContinue: () => void;
  handleCancelAnalysis: () => void;
  reset: () => void;
}

export type ResumeAnalysisPipeline = ResumeAnalysisPipelineState & ResumeAnalysisPipelineHandlers;

// oxlint-disable-next-line complexity -- The pipeline orchestrates parse, JD match, dedup, and question generation; splitting it further fragments shared state.
export function useResumeAnalysisPipeline(
  options: ResumeAnalysisPipelineOptions,
): ResumeAnalysisPipeline {
  const slug = useWorkspaceSlug();
  const { onProfileParsed, onJobDescriptionMatched, onQuestionsGenerated } = options;

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePayload, setResumePayload] = useState<ResumeAnalysisResult | null>(null);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [progressTools, setProgressTools] = useState<{ name: string; done: boolean }[]>([]);
  const [partialFields, setPartialFields] = useState<{ label: string; value: string }[]>([]);
  const [dedupMatches, setDedupMatches] = useState<DedupMatchRecord[] | null>(null);
  const accumulatedTextRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingProfileRef = useRef<ResumeProfile | null>(null);

  // Keep `interviewQuestions` available to consumers without a separate state slot —
  // resumePayload is the single source of truth post-Step 2.
  // 给消费者一个完整的 resumePayload，避免再开一个 questions state。
  function setResumePayloadQuestions(
    profileBundle: { fileName: string; resumeProfile: ResumeProfile },
    questions: InterviewQuestion[],
  ) {
    setResumePayload({
      fileName: profileBundle.fileName,
      interviewQuestions: questions,
      resumeProfile: profileBundle.resumeProfile,
    });
  }

  function tryExtractPartialFields(text: string) {
    const fields: { label: string; value: string }[] = [];
    const FIELD_MAP: { key: string; label: string }[] = [
      { key: '"name"', label: "姓名" },
      { key: '"gender"', label: "性别" },
      { key: '"age"', label: "年龄" },
      { key: '"workYears"', label: "工作年限" },
      { key: '"targetRoles"', label: "目标岗位" },
      { key: '"skills"', label: "技能" },
      { key: '"schools"', label: "院校" },
    ];

    for (const { key, label } of FIELD_MAP) {
      const idx = text.indexOf(key);
      if (idx === -1) continue;
      const afterColon = text.indexOf(":", idx + key.length);
      if (afterColon === -1) continue;
      const rest = text.slice(afterColon + 1).trimStart();
      if (!rest) continue;
      if (rest.startsWith('"')) {
        const endQuote = rest.indexOf('"', 1);
        if (endQuote > 1) {
          const val = rest.slice(1, endQuote);
          if (val && val !== "未发现信息") fields.push({ label, value: val });
        }
      } else if (LEADING_DIGIT_RE.test(rest)) {
        const match = rest.match(LEADING_DIGITS_RE);
        if (match) fields.push({ label, value: match[1] });
      } else if (rest.startsWith("[")) {
        const endBracket = rest.indexOf("]");
        if (endBracket > 1) {
          try {
            const arr = JSON.parse(rest.slice(0, endBracket + 1)) as string[];
            if (arr.length > 0) fields.push({ label, value: arr.slice(0, 5).join("、") });
          } catch {
            /* partial array, skip */
          }
        }
      }
    }
    return fields;
  }

  function handleStreamEvent(event: AnalysisStreamEvent) {
    if (event.type === "status") setProgressStatus(event.message);
    else if (event.type === "tool-start")
      setProgressTools((prev) => [...prev, { done: false, name: event.name }]);
    else if (event.type === "tool-end")
      setProgressTools((prev) =>
        prev.map((t) => (t.name === event.name ? { ...t, done: true } : t)),
      );
    else if (event.type === "text-delta") {
      accumulatedTextRef.current += event.text;
      const fields = tryExtractPartialFields(accumulatedTextRef.current);
      if (fields.length > 0) setPartialFields(fields);
    }
  }

  async function runQuestionGeneration(profileBundle: {
    fileName: string;
    resumeProfile: ResumeProfile;
  }) {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsGeneratingQuestions(true);
    setProgressStatus("正在生成面试题…");
    setProgressTools([]);
    setPartialFields([]);
    accumulatedTextRef.current = "";

    try {
      const qResponse = await fetch("/api/interview/generate-questions", {
        body: JSON.stringify({ resumeProfile: profileBundle.resumeProfile }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: abortController.signal,
      });

      if (!qResponse.ok) {
        const errBody = (await qResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error ?? "面试题生成失败");
      }

      let questions: InterviewQuestion[] | null = null;
      let streamError: string | null = null;

      await readNdjsonStream<AnalysisStreamEvent>(
        qResponse,
        (event) => {
          handleStreamEvent(event);
          if (event.type === "result") {
            const data = event.data as { interviewQuestions?: InterviewQuestion[] };
            questions = data.interviewQuestions ?? null;
          }
          if (event.type === "error") streamError = event.message;
        },
        abortController.signal,
      );

      if (streamError) throw new Error(streamError);

      if (questions) {
        setResumePayloadQuestions(profileBundle, questions);
        onQuestionsGenerated(questions);
        toast.success("面试题生成完成");
      }
    } catch (error) {
      if (abortController.signal.aborted) return;
      toast.error(error instanceof Error ? error.message : "面试题生成失败");
    } finally {
      abortControllerRef.current = null;
      setIsGeneratingQuestions(false);
      setProgressStatus("");
      setProgressTools([]);
      setPartialFields([]);
      accumulatedTextRef.current = "";
    }
  }

  // oxlint-disable-next-line complexity -- See module-level disable; this is the orchestrator.
  const handleResumeChange = useCallback(
    async (file: File | null) => {
      setResumeFile(file);
      setResumePayload(null);
      setDedupMatches(null);
      pendingProfileRef.current = null;
      setProgressStatus("");
      setProgressTools([]);
      setPartialFields([]);
      accumulatedTextRef.current = "";

      if (!file) return;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setIsAnalyzingResume(true);

      try {
        const formData = new FormData();
        formData.append("resume", file);
        const parseResponse = await fetch("/api/interview/parse-resume", {
          body: formData,
          method: "POST",
          signal: abortController.signal,
        });
        if (!parseResponse.ok) {
          const errBody = (await parseResponse.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(errBody?.error ?? "简历解析失败");
        }

        interface ParseResult {
          fileName: string;
          resumeProfile: ResumeProfile;
        }
        let parseResult: ParseResult | null = null;
        let streamError: string | null = null;

        await readNdjsonStream<AnalysisStreamEvent>(
          parseResponse,
          (event) => {
            handleStreamEvent(event);
            if (event.type === "result") parseResult = event.data as ParseResult;
            if (event.type === "error") streamError = event.message;
          },
          abortController.signal,
        );

        if (streamError) throw new Error(streamError);
        if (!parseResult) throw new Error("简历解析未返回有效结果");

        const { fileName, resumeProfile } = parseResult as ParseResult;
        onProfileParsed({ fileName, resumeProfile });
        setResumePayload({
          fileName,
          interviewQuestions: [],
          resumeProfile,
        });
        setIsAnalyzingResume(false);
        setProgressTools([]);
        setPartialFields([]);
        accumulatedTextRef.current = "";
        toast.success("简历解析完成，已回填候选人信息");

        // Match best in-flight JD; non-fatal.
        void (async () => {
          try {
            const matchResponse = await rpc.api.interview["match-job-description"].$post(
              { json: { resumeProfile } },
              { init: { signal: abortController.signal } },
            );
            if (!matchResponse.ok) return;
            const matchPayload = (await matchResponse.json().catch(() => null)) as {
              matchedId?: string | null;
              reason?: string | null;
            } | null;
            if (matchPayload?.matchedId) {
              onJobDescriptionMatched(matchPayload.matchedId, matchPayload.reason ?? null);
              toast.success(
                matchPayload.reason
                  ? `已匹配在招岗位：${matchPayload.reason}`
                  : "已自动匹配在招岗位",
              );
            }
          } catch {
            /* swallow — user can pick manually */
          }
        })();

        let dedupHit = false;
        try {
          const { matches } = await fetchInterviewDedup(slug, {
            email: resumeProfile.email,
            name: resumeProfile.name,
            phone: resumeProfile.phone,
          });
          if (matches.length > 0) {
            dedupHit = true;
            pendingProfileRef.current = resumeProfile;
            setDedupMatches(matches);
            return;
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            toast.warning(
              error instanceof Error
                ? `身份查重失败，已跳过：${error.message}`
                : "身份查重失败，已跳过",
            );
          }
        }

        if (!dedupHit) {
          await runQuestionGeneration({ fileName, resumeProfile });
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        setResumePayload((prev) => prev); // keep nothing if profile never set
        setResumeFile(null);
        toast.error(error instanceof Error ? error.message : "简历分析失败");
      } finally {
        abortControllerRef.current = null;
        setIsAnalyzingResume(false);
        setIsGeneratingQuestions(false);
        setProgressStatus("");
        setProgressTools([]);
        setPartialFields([]);
        accumulatedTextRef.current = "";
      }
    },
    [onJobDescriptionMatched, onProfileParsed, slug],
  );

  const handleDedupContinue = useCallback(() => {
    const profile = pendingProfileRef.current;
    setDedupMatches(null);
    pendingProfileRef.current = null;
    if (profile && resumePayload) {
      void runQuestionGeneration({ fileName: resumePayload.fileName, resumeProfile: profile });
    }
  }, [resumePayload]);

  const handleCancelAnalysis = useCallback(() => {
    abortControllerRef.current?.abort();
    setResumeFile(null);
    setResumePayload(null);
    setIsAnalyzingResume(false);
    setIsGeneratingQuestions(false);
    setProgressStatus("");
    setProgressTools([]);
    setPartialFields([]);
    setDedupMatches(null);
    pendingProfileRef.current = null;
    accumulatedTextRef.current = "";
    toast.info("已取消简历分析");
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setResumeFile(null);
    setResumePayload(null);
    setIsAnalyzingResume(false);
    setIsGeneratingQuestions(false);
    setProgressStatus("");
    setProgressTools([]);
    setPartialFields([]);
    setDedupMatches(null);
    pendingProfileRef.current = null;
    accumulatedTextRef.current = "";
  }, []);

  const isBusy = isAnalyzingResume || isGeneratingQuestions || dedupMatches !== null;

  return {
    dedupMatches,
    handleCancelAnalysis,
    handleDedupContinue,
    handleResumeChange,
    isAnalyzingResume,
    isBusy,
    isGeneratingQuestions,
    partialFields,
    progressStatus,
    progressTools,
    reset,
    resumeFile,
    resumePayload,
  };
}
```

- [ ] **Step 2: 跑单测，应 PASS**

Run: `pnpm test src/app/\(auth\)/w/\[slug\]/studio/_components/__tests__/use-resume-analysis-pipeline.test.ts`
Expected: 3 tests PASS

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: commit**

```bash
git add src/app/\(auth\)/w/\[slug\]/studio/_components/use-resume-analysis-pipeline.ts
git commit -m "feat(studio): extract useResumeAnalysisPipeline hook"
```

---

### Task 5: 实现 ResumeAnalysisOverlay 组件

**Files:**

- Create: `src/app/(auth)/w/[slug]/studio/_components/resume-analysis-overlay.tsx`

- [ ] **Step 1: 写组件**

```tsx
"use client";

// 流式分析浮层：忙状态下绝对定位覆盖弹窗内容，dedup 命中时切换到
// ResumeDedupOverlay。`pipeline` 入参直接传 useResumeAnalysisPipeline 返回值即可。
//
// Streaming analysis overlay. Renders the dedup confirmation when dedupMatches
// is non-null, otherwise shows the loader / status / tools / partial fields.

import type { ResumeAnalysisPipeline } from "@/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline";
import { ResumeDedupOverlay } from "@/components/resume-dedup-overlay";
import { TextFlip } from "@/components/text-flip";
import { Button } from "@/components/ui/button";
import { CheckIcon, LoaderCircleIcon, WrenchIcon } from "lucide-react";
import { motion } from "motion/react";

export function ResumeAnalysisOverlay({ pipeline }: { pipeline: ResumeAnalysisPipeline }) {
  if (!pipeline.isBusy) return null;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-white/80 px-6 py-8 backdrop-blur-sm dark:bg-black/50"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {pipeline.dedupMatches ? (
        <ResumeDedupOverlay
          matches={pipeline.dedupMatches}
          onCancel={pipeline.handleCancelAnalysis}
          onContinue={pipeline.handleDedupContinue}
        />
      ) : (
        <>
          <LoaderCircleIcon className="size-7 animate-spin text-muted-foreground" />
          {pipeline.progressStatus ? (
            <p className="font-medium text-foreground text-sm">{pipeline.progressStatus}</p>
          ) : (
            <motion.div className="flex items-center font-medium text-foreground text-lg" layout>
              <span>正在</span>
              <TextFlip as={motion.span} interval={2.5} layout>
                <span>解析简历</span>
                <span>提取信息</span>
                <span>分析简历</span>
                <span>评估技能</span>
              </TextFlip>
            </motion.div>
          )}
          {pipeline.progressTools.length > 0 && (
            <div className="flex flex-col gap-1.5 text-muted-foreground text-xs">
              {pipeline.progressTools.map((t) => (
                <div className="flex items-center gap-1.5" key={t.name}>
                  {t.done ? (
                    <CheckIcon className="size-3 text-green-500" />
                  ) : (
                    <WrenchIcon className="size-3 animate-pulse" />
                  )}
                  <span>{t.name}</span>
                </div>
              ))}
            </div>
          )}
          {pipeline.partialFields.length > 0 && (
            <div className="mx-auto grid w-full max-w-xs grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border bg-background/80 px-4 py-3 text-xs">
              {pipeline.partialFields.map((f) => (
                <div className="contents" key={f.label}>
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="truncate font-medium text-foreground">{f.value}</span>
                </div>
              ))}
            </div>
          )}
          <Button onClick={pipeline.handleCancelAnalysis} size="sm" variant="outline">
            取消
          </Button>
        </>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: commit**

```bash
git add src/app/\(auth\)/w/\[slug\]/studio/_components/resume-analysis-overlay.tsx
git commit -m "feat(studio): add ResumeAnalysisOverlay shared component"
```

---

### Task 6: 重构 CreateInterviewDialog 消费 hook + overlay

**Files:**

- Modify: `src/app/(auth)/w/[slug]/studio/interviews/_components/create-interview-dialog.tsx`

- [ ] **Step 1: 删除 dialog 内被 hook 接管的所有本地状态与函数**

Open `create-interview-dialog.tsx`. Delete:

- `LEADING_DIGIT_RE`, `LEADING_DIGITS_RE` module constants
- `useState` for `resumeFile`, `resumePayload`, `isAnalyzingResume`, `isGeneratingQuestions`, `progressStatus`, `progressTools`, `partialFields`, `dedupMatches`
- `useRef` for `accumulatedTextRef`, `abortControllerRef`, `pendingProfileRef`
- The functions `tryExtractPartialFields`, `handleStreamEvent`, `runQuestionGeneration`, `handleResumeChange`, `handleDedupContinue`, `handleCancelAnalysis`
- The `isBusy` local

Keep: `activeTab` state, `resetTransientDialogState` (rename to `resetDialog`, keep the file-input DOM reset).

- [ ] **Step 2: 接 hook**

Just above `const form = useInterviewForm(...)`, add:

```tsx
const pipeline = useResumeAnalysisPipeline({
  onProfileParsed: ({ fileName: _fileName, resumeProfile }) => {
    form.setFieldValue("candidateName", resumeProfile.name);
    form.setFieldValue("candidateEmail", resumeProfile.email ?? "");
    form.setFieldValue("candidatePhone", resumeProfile.phone ?? "");
    form.setFieldValue("targetRole", resumeProfile.targetRoles[0] ?? "");
    form.setFieldValue("interviewQuestions", []);
  },
  onJobDescriptionMatched: (matchedId) => {
    form.setFieldValue("jobDescriptionId", matchedId);
  },
  onQuestionsGenerated: (questions) => {
    form.setFieldValue("interviewQuestions", questions);
  },
});
```

Replace all references to the deleted locals with `pipeline.*`:

- `resumeFile` → `pipeline.resumeFile`
- `resumePayload` → `pipeline.resumePayload`
- `isAnalyzingResume` → `pipeline.isAnalyzingResume`
- `isGeneratingQuestions` → `pipeline.isGeneratingQuestions`
- `isBusy` → `pipeline.isBusy`
- File input `onChange`: `(event) => void pipeline.handleResumeChange(event.target.files?.[0] ?? null)`

- [ ] **Step 3: `resetDialog` 调 pipeline.reset() + DOM reset**

```tsx
const resetDialog = useCallback(() => {
  pipeline.reset();
  setActiveTab("basic");
  const fileInput = document.querySelector("#resume-upload") as HTMLInputElement | null;
  if (fileInput) fileInput.value = "";
}, [pipeline]);
```

- [ ] **Step 4: 用 ResumeAnalysisOverlay 替换原 motion.div 块**

Find the block `{isBusy && ( <motion.div … > … </motion.div> )}` and replace with:

```tsx
<ResumeAnalysisOverlay pipeline={pipeline} />
```

Add imports:

```tsx
import { useResumeAnalysisPipeline } from "@/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline";
import { ResumeAnalysisOverlay } from "@/app/(auth)/w/[slug]/studio/_components/resume-analysis-overlay";
```

Remove now-unused imports (`CheckIcon`, `LoaderCircleIcon`, `SparklesIcon`, `WrenchIcon`, `TextFlip`, `ResumeDedupOverlay`, `readNdjsonStream`, `rpc`, `fetchInterviewDedup`, `motion`, `AnalysisStreamEvent`) — keep only what the form / footer / tabs still need.

- [ ] **Step 5: typecheck + check + tests**

Run:

```bash
pnpm typecheck
pnpm check
pnpm test
```

Expected: all PASS

- [ ] **Step 6: 手动回归（关键）**

启动 dev server: `pnpm dev`

- 打开 `/studio/interviews`，点「新建面试记录」
- 上传一份 PDF，观察：进度条 → 表单回填 → JD 匹配 → 题目生成
- 命中查重场景：手动选择一个与现有候选人姓名重叠的简历（如需 fixture）
- 取消按钮、文件二次切换、提交流程

如果任一项与改造前体验不一致，**回到 Step 1-4 修复，不要进入下一个 Task**。

- [ ] **Step 7: commit**

```bash
git add src/app/\(auth\)/w/\[slug\]/studio/interviews/_components/create-interview-dialog.tsx
git commit -m "refactor(studio): consume useResumeAnalysisPipeline in CreateInterviewDialog"
```

---

## Phase 3 — 简历库 dialog 改造

### Task 7: 重写 UploadResumeDialog 为 CreateResumeRecordDialog（双 submit）

**Files:**

- Modify: `src/app/(auth)/w/[slug]/studio/resumes/_components/upload-resume-dialog.tsx`

- [ ] **Step 1: 重写组件**

完整替换 `upload-resume-dialog.tsx` 文件内容：

```tsx
"use client";

// 「新建简历记录」对话框。接入 useResumeAnalysisPipeline 自动解析简历 / 匹配 JD /
// 出题；footer 双按钮：仅保存 (POST /studio/resumes) 或保存并发起面试
// (POST /studio/interviews，附默认 1 条 schedule 行)。
//
// "Create resume record" dialog. Wires the shared analysis pipeline and offers
// two submit paths: save-only (resume library) or save-and-start (kicks off a
// 1-round interview with default schedule).

import { useForm, useStore } from "@tanstack/react-form";
import { FileUpIcon, LoaderCircleIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ResumeAnalysisOverlay } from "@/app/(auth)/w/[slug]/studio/_components/resume-analysis-overlay";
import { useResumeAnalysisPipeline } from "@/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline";
import { CandidateFormFields } from "@/components/candidate-form-fields";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { apiFetch } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { ResumeAnalysisResult } from "@/lib/shared/interview/types";
import { createDefaultScheduleEntry } from "@/lib/shared/studio-interviews";
import type { StudioInterviewRecord } from "@/lib/shared/studio-interviews";
import {
  createResumeLibraryFormValues,
  resumeLibraryFormSchema,
  type ResumeLibraryDetail,
  type ResumeLibraryFormValues,
} from "@/lib/shared/studio-resumes";

export type CreateResumeRecordResult =
  | { mode: "save-only"; detail: ResumeLibraryDetail }
  | { mode: "save-and-start"; record: StudioInterviewRecord };

type SubmitMode = "save-only" | "save-and-start";

interface CreateResumeRecordDialogProps {
  onCreated: (result: CreateResumeRecordResult) => void;
}

function buildSaveOnlyFormData(
  value: ResumeLibraryFormValues,
  file: File | null,
  resumePayload: ResumeAnalysisResult | null,
): FormData {
  const fd = new FormData();
  fd.append("candidateName", value.candidateName);
  fd.append("candidateEmail", value.candidateEmail);
  fd.append("candidatePhone", value.candidatePhone);
  fd.append("targetRole", value.targetRole);
  fd.append("jobDescriptionId", value.jobDescriptionId);
  fd.append("notes", value.notes);
  if (file) fd.append("resume", file);
  if (resumePayload) fd.append("resumePayload", JSON.stringify(resumePayload));
  return fd;
}

function buildSaveAndStartFormData(
  value: ResumeLibraryFormValues,
  file: File | null,
  resumePayload: ResumeAnalysisResult | null,
): FormData {
  const fd = new FormData();
  fd.append("candidateName", value.candidateName);
  fd.append("candidateEmail", value.candidateEmail);
  fd.append("candidatePhone", value.candidatePhone);
  fd.append("targetRole", value.targetRole);
  fd.append("jobDescriptionId", value.jobDescriptionId);
  fd.append("notes", value.notes);
  fd.append("status", "ready");
  fd.append("scheduleEntries", JSON.stringify([createDefaultScheduleEntry()]));
  if (file) fd.append("resume", file);
  if (resumePayload) fd.append("resumePayload", JSON.stringify(resumePayload));
  return fd;
}

export function CreateResumeRecordDialog({ onCreated }: CreateResumeRecordDialogProps) {
  const slug = useWorkspaceSlug();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitModeRef = useRef<SubmitMode>("save-only");

  const form = useForm({
    defaultValues: createResumeLibraryFormValues(),
    validators: {
      onSubmit: resumeLibraryFormSchema,
    },
    onSubmit: async ({ value }) => {
      const mode = submitModeRef.current;
      setSubmitting(true);
      try {
        if (mode === "save-only") {
          const detail = await apiFetch<ResumeLibraryDetail>(`/api/w/${slug}/studio/resumes`, {
            body: buildSaveOnlyFormData(value, pipeline.resumeFile, pipeline.resumePayload),
            method: "POST",
          });
          toast.success("简历记录已创建");
          onCreated({ detail, mode: "save-only" });
        } else {
          const record = await apiFetch<StudioInterviewRecord>(`/api/w/${slug}/studio/interviews`, {
            body: buildSaveAndStartFormData(value, pipeline.resumeFile, pipeline.resumePayload),
            method: "POST",
          });
          toast.success("已创建并发起 1 轮面试");
          onCreated({ mode: "save-and-start", record });
        }
        setOpen(false);
        form.reset(createResumeLibraryFormValues());
        pipeline.reset();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "提交失败");
      } finally {
        setSubmitting(false);
      }
    },
  });

  const pipeline = useResumeAnalysisPipeline({
    onProfileParsed: ({ resumeProfile }) => {
      form.setFieldValue("candidateName", resumeProfile.name);
      form.setFieldValue("candidateEmail", resumeProfile.email ?? "");
      form.setFieldValue("candidatePhone", resumeProfile.phone ?? "");
      form.setFieldValue("targetRole", resumeProfile.targetRoles[0] ?? "");
    },
    onJobDescriptionMatched: (matchedId) => {
      form.setFieldValue("jobDescriptionId", matchedId);
    },
    onQuestionsGenerated: () => {
      // resumePayload 已在 hook 内更新，弹窗不展示题目，故不动表单。
      // resumePayload is updated inside the hook; dialog has no questions UI.
    },
  });

  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
  const jobDescriptionId = useStore(form.store, (s) => s.values.jobDescriptionId);
  const isBusy = submitting || isSubmitting || pipeline.isBusy;

  // 「保存并发起面试」要求 jobDescriptionId 非空（studioInterviewFormSchema 强制）。
  // 「save-and-start」requires JD because studioInterviewFormSchema enforces it.
  const canSaveAndStart = jobDescriptionId.trim().length > 0;

  const triggerSubmit = useCallback(
    (mode: SubmitMode) => {
      submitModeRef.current = mode;
      void form.handleSubmit();
    },
    [form],
  );

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button">
        <FileUpIcon className="size-4" />
        新建简历记录
      </Button>

      <Modal
        dismissible={!isBusy}
        showCloseButton={!isBusy}
        onOpenChange={(next) => {
          if (!next && isBusy) return;
          if (!next) {
            pipeline.reset();
            form.reset(createResumeLibraryFormValues());
          }
          setOpen(next);
        }}
        open={open}
        size="md"
        title="新建简历记录"
        description="上传 PDF 自动解析候选人信息、匹配岗位并生成面试题；可仅入库，或一键发起 AI 面试。"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              disabled={isBusy}
              onClick={() => triggerSubmit("save-only")}
              type="button"
              variant="outline"
            >
              {isBusy && submitModeRef.current === "save-only" ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : null}
              保存
            </Button>
            <Button
              disabled={isBusy || !canSaveAndStart}
              onClick={() => triggerSubmit("save-and-start")}
              type="button"
              title={canSaveAndStart ? undefined : "请先选择在招岗位"}
            >
              {isBusy && submitModeRef.current === "save-and-start" ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : null}
              保存并发起面试
            </Button>
          </div>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            // Modal footer 触发提交时手动 handleSubmit，禁用 form 默认 submit。
            // Footer buttons drive submit explicitly; suppress native form submit.
            e.preventDefault();
          }}
        >
          <CandidateFormFields
            disabled={isBusy}
            form={form}
            onResumeFileChange={(file) => void pipeline.handleResumeChange(file)}
            resumeFile={pipeline.resumeFile}
          />
        </form>

        <ResumeAnalysisOverlay pipeline={pipeline} />
      </Modal>
    </>
  );
}

// Backwards-compatible alias so existing imports don't break in this commit.
// Phase 3 Step 3 retires this re-export.
export const UploadResumeDialog = CreateResumeRecordDialog;
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS（如果 `studio-person-detail-dialog.tsx` 等地方因 onCreated signature 报错，会在 Task 8 修；先确认本文件本身编译通过即可）

- [ ] **Step 3: commit**

```bash
git add src/app/\(auth\)/w/\[slug\]/studio/resumes/_components/upload-resume-dialog.tsx
git commit -m "feat(resumes): rewrite UploadResumeDialog as CreateResumeRecordDialog with dual submit"
```

---

### Task 8: ResumeLibraryPage 处理 union onCreated

**Files:**

- Modify: `src/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page.tsx`

- [ ] **Step 1: 更新 import 与调用点**

Replace the existing two `UploadResumeDialog` usages (page header toolbar + empty state) to handle the union. Find:

```tsx
import { UploadResumeDialog } from "./upload-resume-dialog";
```

Change to:

```tsx
import { CreateResumeRecordDialog, type CreateResumeRecordResult } from "./upload-resume-dialog";
```

- [ ] **Step 2: 添加 onCreated handler**

Inside `ResumeLibraryPage`, just below `invalidateAll`, add:

```tsx
function handleCreated(result: CreateResumeRecordResult) {
  invalidateAll();
  if (result.mode === "save-and-start") {
    // 「保存并发起面试」的记录会同时出现在 AI 面试列表；
    // 保留在简历库列表 + toast 已在 dialog 内处理。Per spec Open Item #1, no redirect.
    // The record also appears in the interview list. Dialog already toasts.
    // Per spec open item #1: no redirect — list refresh is enough.
  }
}
```

- [ ] **Step 3: 替换调用点**

Find:

```tsx
toolbarRight={<UploadResumeDialog onCreated={() => invalidateAll()} />}
```

And:

```tsx
<UploadResumeDialog onCreated={() => invalidateAll()} />
```

Replace both with:

```tsx
toolbarRight={<CreateResumeRecordDialog onCreated={handleCreated} />}
```

And:

```tsx
<CreateResumeRecordDialog onCreated={handleCreated} />
```

- [ ] **Step 4: 移除向后兼容的别名**

回到 `upload-resume-dialog.tsx`，删除最后一行的 `export const UploadResumeDialog = CreateResumeRecordDialog;`。

- [ ] **Step 5: typecheck + check**

Run:

```bash
pnpm typecheck
pnpm check
```

Expected: PASS

- [ ] **Step 6: commit**

```bash
git add src/app/\(auth\)/w/\[slug\]/studio/resumes/_components/resume-library-page.tsx \
        src/app/\(auth\)/w/\[slug\]/studio/resumes/_components/upload-resume-dialog.tsx
git commit -m "feat(resumes): wire ResumeLibraryPage to CreateResumeRecordDialog union result"
```

---

## Phase 4 — 详情弹窗

### Task 9: StudioPersonDetailDialog 在 resume 模式展示面试题 tab

**Files:**

- Modify: `src/app/(auth)/w/[slug]/studio/_components/studio-person-detail-dialog.tsx`

- [ ] **Step 1: UnifiedRecord 在 resume 分支也填 interviewQuestions**

Open `studio-person-detail-dialog.tsx`. Find the `UnifiedRecord` interface — note `interviewQuestions?` 是 "interview-mode only"。改成两边都允许：keep type signature the same (`interviewQuestions?: StudioInterviewRecord["interviewQuestions"]`), and add to the resume mode mapping (currently `studio-person-detail-dialog.tsx:190-204`):

```tsx
} else if (mode === "resume" && resumeRecord) {
  record = {
    candidateEmail: resumeRecord.candidateEmail,
    candidateName: resumeRecord.candidateName,
    candidatePhone: resumeRecord.candidatePhone,
    creatorName: resumeRecord.creatorName,
    hasResumeFile: resumeRecord.hasResumeFile,
    id: resumeRecord.id,
    interviewQuestions: resumeRecord.interviewQuestions,
    jobDescriptionName: resumeRecord.jobDescriptionName,
    notes: resumeRecord.notes,
    resumeFileName: resumeRecord.resumeFileName,
    resumeProfile: resumeRecord.resumeProfile,
    targetRole: resumeRecord.targetRole,
  };
}
```

- [ ] **Step 2: Tabs 在 resume 模式下条件展示 questions tab**

Find the TabsList block (around `studio-person-detail-dialog.tsx:375-405`). The current `<TabsTrigger value="questions">` is wrapped in `{mode === "interview" ? <> … </> : null}`. Carve it out so questions has its own conditional:

Replace:

```tsx
{
  mode === "interview" ? (
    <>
      <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="reports">
        面试报告
      </TabsTrigger>
      <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="questions">
        AI 题目
      </TabsTrigger>
    </>
  ) : null;
}
```

With:

```tsx
{
  mode === "interview" ? (
    <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="reports">
      面试报告
    </TabsTrigger>
  ) : null;
}
{
  mode === "interview" || interviewQuestions.length > 0 ? (
    <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="questions">
      AI 题目
    </TabsTrigger>
  ) : null;
}
```

- [ ] **Step 3: TabsContent for questions 同步放开**

Find the existing `mode === "interview" ? <TabsContent value="questions"> … </TabsContent> : null` block (around `studio-person-detail-dialog.tsx:799-829`). Replace the gate:

```tsx
{
  mode === "interview" || interviewQuestions.length > 0 ? (
    <TabsContent value="questions">{/* keep existing inner JSX as-is */}</TabsContent>
  ) : null;
}
```

Don't change the inner JSX; the existing rendering already iterates `visibleInterviewQuestions` and shows the empty state. Resume-mode "暂无面试题" path is unreachable here because we gate on `length > 0` for visibility — but leaving the empty-state branch in is harmless.

- [ ] **Step 4: typecheck + check + tests**

Run:

```bash
pnpm typecheck
pnpm check
pnpm test
```

Expected: PASS

- [ ] **Step 5: commit**

```bash
git add src/app/\(auth\)/w/\[slug\]/studio/_components/studio-person-detail-dialog.tsx
git commit -m "feat(studio): surface generated questions in resume detail dialog"
```

---

## Phase 5 — Verification

### Task 10: 全量验证 + 手动 e2e

**Files:** N/A — verification only

- [ ] **Step 1: 跑完整 CI**

```bash
pnpm typecheck
pnpm check
pnpm test
```

Expected: all PASS

- [ ] **Step 2: dev 启动**

```bash
pnpm dev
```

- [ ] **Step 3: 手动验收 —— 分支 A「保存」**

1. 访问 `/w/<slug>/studio/resumes`
2. 点右上角「新建简历记录」（按钮文案确认）
3. 上传一份测试 PDF
4. 观察 overlay：spinner → 「正在解析简历」TextFlip → tools 出现并打勾 → partial fields 出现
5. 解析完成后 toast「简历解析完成，已回填候选人信息」
6. 表单字段已回填：姓名 / 邮箱 / 电话 / 目标岗位
7. JD 命中则自动选中 + toast「已匹配在招岗位」
8. 题目生成完成 toast「面试题生成完成」
9. 点「保存」→ toast「简历记录已创建」→ 弹窗关闭 → 列表 prepend 新行
10. 打开新行的详情对话框：
    - 概览 / 经历 tab 显示正常
    - 「AI 题目」tab 可见，列出生成的题
11. 编辑（铅笔按钮）只看到候选人字段，无面试题；保留现状

- [ ] **Step 4: 手动验收 —— 分支 B「保存并发起面试」**

1. 再点「新建简历记录」
2. 上传一份 PDF 走完解析（JD 必须命中或手动选）
3. 注意：JD 为空时「保存并发起面试」按钮 disabled，hover 看到提示「请先选择在招岗位」
4. JD 有值后点「保存并发起面试」→ toast「已创建并发起 1 轮面试」
5. 弹窗关闭，回到简历库列表，新行可见
6. 跳到 `/w/<slug>/studio/interviews`，列表里也能看到该记录
7. 点详情 → 「面试安排」section 有 1 条 schedule row：
   - roundLabel = 一面
   - status = 待开始 (pending)
   - 允许文本输入开关 = OFF（默认）

- [ ] **Step 5: 手动验收 —— 查重 / 取消 / 不上传 PDF 三个边界**

- 查重：用一个与现有候选人姓名/邮箱/电话相同的 PDF 上传 → overlay 切到 `ResumeDedupOverlay`，点「继续录入」→ 出题流继续
- 取消：上传 PDF 后立即点「取消」→ 文件被清空，表单维持原值
- 不上传 PDF：清空文件，直接填表单点「保存」→ 创建空简历记录；点「保存并发起面试」（JD 仍需选）→ 创建 1 轮面试记录

- [ ] **Step 6: AI 面试侧回归**

回到 `/w/<slug>/studio/interviews`，点「新建面试记录」走 PDF 解析 + 多轮 schedule + 提交，确认行为与改造前完全一致。

- [ ] **Step 7: commit verification log（可选）**

如果手动验收出现任何偏差，回到对应 Task 修复并补 commit。全部通过则进入终结。

- [ ] **Step 8: 收口**

无新 commit。把这次的所有 commit 总结打入 PR 描述模板（可选）。

---

## Out-of-scope / Follow-ups（不在本次实现）

- 简历库 `PATCH /studio/resumes/:id` 编辑流程也支持重新解析 / 重新出题
- 简历库 dedup-check 路由 `/api/w/:slug/studio/resumes/dedup-check` 标 deprecated（`fetchResumeDedup` 客户端 helper 同步删除）
- 详情对话框 resume 模式增加「重新生成面试题」按钮
- 简历库「保存并发起面试」时支持自定义首轮 scheduledAt（弹窗内 DateTimePicker）

---

## Risk reminders

1. **`useResumeAnalysisPipeline` 抽取改动 `CreateInterviewDialog` 的内部状态拓扑**。Task 6 的手动回归不可跳过——hook 单测覆盖的是 callback 契约，不是完整 UI 行为。
2. **「保存并发起面试」走的是 `/studio/interviews` POST**，触发的 `autoBindApplicableTemplates` 事务可能比简历库 POST 慢。提示用户耐心，按钮 spinner 已挂。
3. **`createDefaultScheduleEntry()` 的 `roundLabel` 是「一面」**。若产品后续想统一改成「初轮」之类，请改 shared 工厂而不是各处 hardcode。
