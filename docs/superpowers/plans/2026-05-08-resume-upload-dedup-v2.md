# 简历上传跨路径去重 v2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 chat_attachment 升级为跨路径的统一注册表——studio interview 上传简历时跨表查询、命中复用 storageKey + 解析；未命中则 PUT + parse + 写一行 chat_attachment，让 chat 路径反向也能复用。

**Architecture:** 不加任何 schema 列。`storeInterviewResume` 改造为先查 chat_attachment（用 v1 的 `findAttachmentByContentHash`），命中时复用 storageKey + 用 `toResumeProfile()` 把 superset 投影成 ResumeProfile 返回；未命中时跑 `parseResumeFast` + S3 PUT + 写 chat_attachment 行。`analyzeResumeFile` 拆成 parse 半段 + question-gen 半段，studio 创建路由在拿到 cached profile 时只跑 question-gen。

**Tech Stack:** Next.js 16 App Router、Hono、Drizzle ORM、Vitest，复用 v1 的 `chat_attachment` 表 + `parseResumeFast` 流水线。

---

## File Structure

**修改：**

- `src/server/agents/resume-parser-agent.ts` — 追加 `projectAttachmentToResumeProfile` 投影工具。
- `src/server/agents/resume-analysis-agent.ts` — 拆出 `parseResumeFastToProfile` + `generateInterviewQuestionsForProfile`；保留 `analyzeResumeFile` 作为组合。
- `src/server/routes/interview/utils.ts` — 重写 `storeInterviewResume`（cross-table + 写 chat_attachment + 返回 cached profile）。
- `src/server/routes/interview/route.ts` — 创建（line ~666–688）+ 编辑（line ~964–973）两处调用点。

**新增（测试）：**

- `src/server/agents/__tests__/resume-parser-agent.test.ts` — 投影工具单测。
- `src/server/routes/interview/__tests__/store-interview-resume.test.ts` — 分支覆盖。

**不动：**

- 数据库 schema（v2 完全是行为改造）。
- `chat_attachment` 查询层（v1 的 `findAttachmentByContentHash` 已经满足需求）。
- chat 上传路径（透明受益于 studio 写入的行）。
- 读路径（`GET /api/chat/attachments/:id`、`GET /api/studio/interviews/:id/resume`）。

---

## Task 1: 投影工具 `projectAttachmentToResumeProfile`

**Files:**

- Create: `src/server/agents/__tests__/resume-parser-agent.test.ts`
- Modify: `src/server/agents/resume-parser-agent.ts`

把 chat_attachment 行的 superset `parsedStructured`（任意 `unknown` 形态）投影到 `ResumeProfile`；形状不符时返回 null（让调用方走完整 parse 兜底）。

- [ ] **Step 1: 写失败的测试**

```ts
// src/server/agents/__tests__/resume-parser-agent.test.ts
//
// `projectAttachmentToResumeProfile` 把 chat_attachment 行的 superset
// 投影到 ResumeProfile 子集，形状不符时返回 null。
import { describe, expect, it } from "vitest";
import {
  projectAttachmentToResumeProfile,
  toResumeProfile,
} from "@/server/agents/resume-parser-agent";

const MINIMAL_STRUCTURED = {
  age: 28,
  contact: { email: null, phone: null },
  degree: null,
  education: [],
  gender: "男",
  graduationYear: null,
  links: [],
  major: null,
  name: "郭靖",
  personalStrengths: ["沟通"],
  projectExperiences: [],
  schools: ["清华大学"],
  skills: ["TypeScript"],
  targetRoles: ["前端工程师"],
  timelineSummary: null,
  workExperiences: [],
  workYears: 5,
};

describe("projectAttachmentToResumeProfile", () => {
  it("returns null when input is null", () => {
    expect(projectAttachmentToResumeProfile(null)).toBeNull();
  });

  it("returns null when input does not match structured schema", () => {
    expect(projectAttachmentToResumeProfile({ random: "shape" })).toBeNull();
  });

  it("projects a valid superset down to ResumeProfile", () => {
    const result = projectAttachmentToResumeProfile(MINIMAL_STRUCTURED);
    expect(result).not.toBeNull();
    expect(result).toEqual(toResumeProfile(MINIMAL_STRUCTURED));
  });

  it("normalizes empty name to '未发现信息'", () => {
    const result = projectAttachmentToResumeProfile({ ...MINIMAL_STRUCTURED, name: "   " });
    expect(result?.name).toBe("未发现信息");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test src/server/agents/__tests__/resume-parser-agent.test.ts`
Expected: FAIL — `projectAttachmentToResumeProfile is not a function`.

- [ ] **Step 3: 实现**

打开 `src/server/agents/resume-parser-agent.ts`，在文件**末尾**追加（保持现有 `export { readPdfBytes };` 在更上方）：

```ts
// 把 chat_attachment 行的 superset parsedStructured 投影到 ResumeProfile，
// 调用方据此判断是否能跳过 parseResumeFast。形状不符时静默返回 null
// ——让调用方走完整 parse 兜底。
// Project a chat_attachment row's superset parsedStructured down to
// ResumeProfile. Callers use this to decide whether they can skip
// parseResumeFast. Returns null on shape mismatch so callers fall back
// to a full parse.
export function projectAttachmentToResumeProfile(parsedStructured: unknown): ResumeProfile | null {
  if (parsedStructured === null || parsedStructured === undefined) {
    return null;
  }
  const parsed = structuredSchema.safeParse(parsedStructured);
  if (!parsed.success) {
    return null;
  }
  return toResumeProfile(parsed.data);
}
```

`structuredSchema`、`toResumeProfile`、`ResumeProfile` 在同一文件里已经全部就绪（前者 import 自 `./resume-parser-schema`，后两者就在本文件）。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test src/server/agents/__tests__/resume-parser-agent.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: typecheck**

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/server/agents/resume-parser-agent.ts src/server/agents/__tests__/resume-parser-agent.test.ts
git commit -m "feat(resume-parser): add projectAttachmentToResumeProfile helper"
```

---

## Task 2: 拆 `analyzeResumeFile` → parse + question-gen

**Files:**

- Modify: `src/server/agents/resume-analysis-agent.ts`

`analyzeResumeFile` 当前 270–318 行内部一气跑完 `parseResumeFast` + LLM 问题生成。把它拆成两段独立可调用的函数，再让 `analyzeResumeFile` 用组合的方式保留向后兼容。

> 没有新写测试——直接对 `analyzeResumeFile` 做组合等价改造，已有 v1 测试覆盖兼容性，且这个函数本身是黑盒 LLM 调用，不适合单元测试。

- [ ] **Step 1: 在文件顶部 export 区追加新接口与新函数**

打开 `src/server/agents/resume-analysis-agent.ts`，在 `export async function analyzeResumeFile` 之**前**插入：

```ts
// =====================================================================
// Stage helpers — 把原 analyzeResumeFile 拆成两段独立可调用：
//   parseResumeFastToProfile —— 字节 → ResumeProfile + 原始 superset
//   generateInterviewQuestionsForProfile —— ResumeProfile → 面试题
// 这样 studio 路由在拿到 cache 命中的 profile 时，只用跑 question-gen。
// Stage helpers split out from analyzeResumeFile so the studio route
// can skip parseResumeFast when it already has a cached resume profile.
// =====================================================================

export interface ParsedResumeProfileResult {
  resumeProfile: ResumeProfile;
  parsedStructured: ResumeParserStructured;
  parsedTextSource: ResumeTextSource;
  parsedPageCount: number;
  parsedText: string;
}

export async function parseResumeFastToProfile(file: File): Promise<ParsedResumeProfileResult> {
  validateResumeFile(file);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fast = await parseResumeFast(bytes);
    return {
      parsedPageCount: fast.pageCount,
      parsedStructured: fast.structured,
      parsedText: fast.text,
      parsedTextSource: fast.textSource,
      resumeProfile: normalizeResumeProfile(toResumeProfile(fast.structured)),
    };
  } catch (error) {
    if (error instanceof ResumeAnalysisError) {
      throw error;
    }
    throw new ResumeAnalysisError(
      error instanceof Error ? error.message : "Failed to extract resume information.",
      "resume-parsing",
    );
  }
}

export async function generateInterviewQuestionsForProfile(
  resumeProfile: ResumeProfile,
): Promise<ResumeAnalysisResult["interviewQuestions"]> {
  try {
    const structuredModelId = process.env.ALIBABA_STRUCTURED_MODEL ?? "deepseek-v4-pro";
    const questionAgent = createResumeAgent({
      enableThinking: false,
      instructions: QUESTION_INSTRUCTIONS,
      modelId: structuredModelId,
      stopWhen: stepCountIs(2),
      temperature: 0.3,
      tools: {},
    });

    const { text } = await questionAgent.generate({
      prompt: `候选人信息：\n${JSON.stringify(resumeProfile, null, 2)}`,
    });

    const parsed = parseJsonOutput(text, generatedInterviewQuestionsSchema, "question-generation");
    return normalizeInterviewQuestions(parsed.interviewQuestions);
  } catch (error) {
    if (error instanceof ResumeAnalysisError) {
      throw error;
    }
    throw new ResumeAnalysisError(
      error instanceof Error ? error.message : "Failed to generate interview questions.",
      "question-generation",
      resumeProfile,
    );
  }
}
```

新增 import：在文件顶部 import 区追加 `ResumeTextSource`、`ResumeParserStructured`：

```ts
import type { ResumeTextSource } from "@/lib/resume-parse-pipeline";
import { structuredSchema, toResumeProfile } from "./resume-parser-agent";
import type { ResumeParserStructured } from "./resume-parser-agent";
```

第二行替换原来的 `import { structuredSchema, toResumeProfile } from "./resume-parser-agent";`（因为现在还需要类型）。`structuredSchema` 这一刻其实没被新代码消费，但 import 语句保持原状是可以的——如果之后 oxlint 抱怨"未使用"，可以拆成单独的 type-only import 行。**先保留，确保不动既有用法。**

> 等等：检查一下 `structuredSchema` 是否仍被原 `analyzeResumeFile` 用到。如未用，可以把它从这一行移除。**实际查看：原代码只有 `toResumeProfile` 在用。`structuredSchema` 在该文件内不再被引用（只在 `resume-parser-agent.ts` 内供其它文件用）。** 因此最终 import 行就是：

```ts
import { toResumeProfile } from "./resume-parser-agent";
import type { ResumeParserStructured } from "./resume-parser-agent";
```

`ResumeTextSource` 那条 import 加在 import 块的合适位置（紧邻 `parseResumeFast` 的 import）。

- [ ] **Step 2: 把 `analyzeResumeFile` 重写为组合**

把现有 `analyzeResumeFile`（约 267–318 行）整段函数体替换为：

```ts
/**
 * Combined: parse profile + generate questions in one blocking call.
 * Used by endpoints that need the full result at once (create/edit interview
 * fallback path when the client hasn't pre-parsed the resume).
 */
export async function analyzeResumeFile(file: File): Promise<ResumeAnalysisResult> {
  const { resumeProfile } = await parseResumeFastToProfile(file);
  const interviewQuestions = await generateInterviewQuestionsForProfile(resumeProfile);
  return { fileName: file.name, interviewQuestions, resumeProfile };
}
```

- [ ] **Step 3: typecheck + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS。

- [ ] **Step 4: 跑全量测试确认无回归**

Run: `pnpm test`
Expected: 所有 v1 测试继续通过 + 新加的投影测试通过。

- [ ] **Step 5: Commit**

```bash
git add src/server/agents/resume-analysis-agent.ts
git commit -m "refactor(resume-analysis): split analyzeResumeFile into parse + question-gen"
```

---

## Task 3: 重写 `storeInterviewResume`（cross-table + 写 chat_attachment）

**Files:**

- Modify: `src/server/routes/interview/utils.ts`

完全替换 v1 的 `storeInterviewResume`：从"查 studio_interview"改为"查 chat_attachment（统一注册表）"，并在未命中时跑 `parseResumeFastToProfile` + 写一行 chat_attachment。签名扩展为接受 `userId`、返回 `{ storageKey, contentHash, cachedResumeProfile } | null`。

- [ ] **Step 1: 更新 import**

打开 `src/server/routes/interview/utils.ts`。将 imports 块改为：

- 从 `drizzle-orm` 拿掉 `and`、`isNotNull`（v1 加的，新版不再需要表内查询）。如果 `eq`、`inArray` 仍有别处使用就保留。**当前文件末尾的 `loadScheduleEntries` 用了 `inArray`、其它地方用 `eq`，所以保留这两个。** 删除 `and` 与 `isNotNull`。
- 从 `@/lib/s3` 拿掉 `buildInterviewResumeKeyByHash`（不再使用），换成 `buildAttachmentKeyByHash`。
- 新增：`createAttachment`、`findAttachmentByContentHash` 来自 `@/server/queries/chat-attachments`；`parseResumeFastToProfile`、`projectAttachmentToResumeProfile` 来自相应 agent 文件；`ResumeProfile` 类型。

最终 import 块（替换原 1–24 行的 import 区）：

```ts
import type { parseScheduleEntriesInput, StudioInterviewRecord } from "@/lib/studio-interviews";
import type { ResumeProfile } from "@/lib/interview/types";
import { eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db } from "@/lib/db";
import {
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
  studioInterview,
  studioInterviewSchedule,
} from "@/lib/db/schema";
import {
  buildCandidateInterviewView,
  buildInterviewLink,
  pickCurrentScheduleEntry,
  sortScheduleEntries,
} from "@/lib/interview/interview-record";
import {
  parseResumeFastToProfile,
  ResumeAnalysisError,
} from "@/server/agents/resume-analysis-agent";
import { projectAttachmentToResumeProfile } from "@/server/agents/resume-parser-agent";
import { createAttachment, findAttachmentByContentHash } from "@/server/queries/chat-attachments";
import {
  ensureApplicableBindings,
  loadInterviewPresetQuestions,
} from "@/server/queries/interview-question-templates";
import { sha256HexOfBytes } from "@/lib/file-hash";
import { buildAttachmentKeyByHash, putObjectBytes } from "@/lib/s3";
```

- [ ] **Step 2: 重写 `storeInterviewResume` 函数体**

把 152–186 行的整个 `storeInterviewResume` 替换为：

```ts
/**
 * 把简历 PDF 写入"统一注册表"（chat_attachment 表）并返回 storageKey
 * + contentHash + 命中时的 cachedResumeProfile。
 *
 * 1. 算 hash → 查 chat_attachment 是否已存在（任意用户、任意路径写入）。
 * 2. 命中：复用 storageKey；从 superset parsedStructured 投影到 ResumeProfile
 *    供调用方判断是否能跳过 parseResumeFast。**不**额外写 chat_attachment 行。
 * 3. 未命中：并行跑 parseResumeFastToProfile + S3 PUT。两者都成功才写一行
 *    chat_attachment（userId = 当前操作者）；S3 失败致命，parse 失败时不
 *    写注册行（避免污染），返回 cachedResumeProfile=null 让调用方兜底。
 *
 * Upload the candidate resume PDF into the unified registry (chat_attachment)
 * and return its storageKey, contentHash, and a cached ResumeProfile when the
 * registry already had this hash.
 *
 * Silently returns null when S3 isn't configured — the interview record still
 * persists, preview just won't be available for this row.
 */
export async function storeInterviewResume(
  _interviewRecordId: string,
  file: File,
  userId: string,
): Promise<{
  storageKey: string;
  contentHash: string;
  cachedResumeProfile: ResumeProfile | null;
} | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentHash = await sha256HexOfBytes(bytes);

    // 命中既有 chat_attachment 行（已过滤 failed）：复用 storageKey + 投影出 cached profile。
    // Registry hit: reuse storageKey and project the cached superset down to ResumeProfile.
    const existing = await findAttachmentByContentHash(contentHash);
    if (existing) {
      return {
        cachedResumeProfile: projectAttachmentToResumeProfile(existing.parsedStructured),
        contentHash,
        storageKey: existing.storageKey,
      };
    }

    // 未命中：parse + PUT 并行。
    // Miss: parse + PUT in parallel.
    const storageKey = await buildAttachmentKeyByHash(contentHash, "pdf");
    const [putOutcome, parseOutcome] = await Promise.allSettled([
      putObjectBytes({
        body: bytes,
        contentType: file.type || "application/pdf",
        storageKey,
      }),
      parseResumeFastToProfile(file),
    ]);

    if (putOutcome.status === "rejected") {
      console.error("[studio-interview] failed to upload resume to S3:", putOutcome.reason);
      return null;
    }

    if (parseOutcome.status === "rejected") {
      // S3 已写字节但 parse 失败：不写 chat_attachment 行（避免污染注册表）。
      // 调用方拿到 cachedResumeProfile=null，会兜底跑 analyzeResumeFile，
      // 那次失败再让上层 ResumeAnalysisError 处理。
      // S3 wrote bytes but parse failed: skip chat_attachment write to keep
      // the registry clean. Caller falls back to analyzeResumeFile, whose
      // failure will surface as ResumeAnalysisError upstream.
      console.error(
        "[studio-interview] resume parse failed (S3 PUT succeeded):",
        parseOutcome.reason,
      );
      return { cachedResumeProfile: null, contentHash, storageKey };
    }

    const parsed = parseOutcome.value;
    await createAttachment({
      contentHash,
      filename: file.name.slice(0, 255) || "resume.pdf",
      id: crypto.randomUUID(),
      mediaType: file.type || "application/pdf",
      parsedAt: new Date(),
      parsedPageCount: parsed.parsedPageCount,
      parsedStatus: "ready",
      parsedStructured: parsed.parsedStructured,
      parsedText: parsed.parsedText,
      parsedTextSource: parsed.parsedTextSource,
      size: file.size,
      storageKey,
      userId,
    });

    return {
      cachedResumeProfile: parsed.resumeProfile,
      contentHash,
      storageKey,
    };
  } catch (error) {
    if (error instanceof ResumeAnalysisError) {
      throw error;
    }
    console.error("[studio-interview] failed to upload resume to S3:", error);
    return null;
  }
}
```

注意：

- 命中分支 `findAttachmentByContentHash` 已经按 v1 设计排除 `parsedStatus="failed"` 的行，所以这里不需要再过滤。
- 命中分支不再写新 chat_attachment 行——不再走 v1 那种"per-user 行复制"模型，因为 studio 路径的视角下注册表是共享的、`studio_interview.resumeStorageKey` 直接持有 storageKey 字符串就够了。
- `_interviewRecordId` 仍然带下划线前缀作为 explicitly unused 标记，与 v1 一致。
- v1 抛出 `ResumeAnalysisError` 时不应被 `catch` 静默吃掉——所以 catch 里显式 rethrow，保留现有 `analyzeResumeFile` 错误传播语义。

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: 报错——两个调用点（route.ts 中创建 + 编辑）签名不匹配，**这是预期的**，Task 4 修。

- [ ] **Step 4: lint**

Run: `pnpm check`
Expected: PASS（lint 不依赖跨文件类型）。

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/interview/utils.ts
git commit -m "refactor(studio-interview): rewrite storeInterviewResume against chat_attachment registry"
```

> Task 4 紧接着修复 typecheck 错误——本任务暂时不要 push 远端。

---

## Task 4: 更新 studio 路由两个调用点

**Files:**

- Modify: `src/server/routes/interview/route.ts`

让创建分支在拿到 cached profile 时跳过 parse；编辑分支仅消费 storageKey/contentHash。

- [ ] **Step 1: 更新创建分支（约 line 666–688）**

定位创建分支中这两段：

```ts
const analysis = parsedResumePayload ?? (resume ? await analyzeResumeFile(resume) : null);
const now = new Date();
const interviewRecordId = crypto.randomUUID();
const uploadResult = resume ? await storeInterviewResume(interviewRecordId, resume) : null;
const resumeStorageKey = uploadResult?.storageKey ?? null;
const resumeContentHash = uploadResult?.contentHash ?? null;
```

替换为（注意：现在先调用 `storeInterviewResume`，再决定是否需要 `analyzeResumeFile`）：

```ts
const now = new Date();
const interviewRecordId = crypto.randomUUID();
const uploadResult = resume
  ? await storeInterviewResume(interviewRecordId, resume, c.var.user!.id)
  : null;
const resumeStorageKey = uploadResult?.storageKey ?? null;
const resumeContentHash = uploadResult?.contentHash ?? null;

// 解析复用顺序：客户端预解析 > 注册表缓存命中 > 现场跑完整 analyzeResumeFile。
// Reuse order: client-prebaked → registry cache → server full analysis.
let analysis = parsedResumePayload;
if (!analysis && resume) {
  if (uploadResult?.cachedResumeProfile) {
    const interviewQuestions = await generateInterviewQuestionsForProfile(
      uploadResult.cachedResumeProfile,
    );
    analysis = {
      fileName: resume.name,
      interviewQuestions,
      resumeProfile: uploadResult.cachedResumeProfile,
    };
  } else {
    analysis = await analyzeResumeFile(resume);
  }
}
```

并在该文件 import 区追加（与现有 `analyzeResumeFile` 的 import 同行）：

```ts
import {
  analyzeResumeFile,
  generateInterviewQuestionsForProfile,
} from "@/server/agents/resume-analysis-agent";
```

> 当前 import 行（约 33）形如 `import { analyzeResumeFile, ... } from "@/server/agents/resume-analysis-agent";`，把 `generateInterviewQuestionsForProfile` 加进去即可，按字母序插入。

`c.var.user` 在该 handler 已经有出现（line 676 `c.var.user?.id ?? null`），所以 `c.var.user!.id` 就地可用——但保险起见，**先加一行 guard**：

把上面 `const uploadResult = resume ? await storeInterviewResume(...)` 整段改成：

```ts
if (resume && !c.var.user) {
  return c.json({ error: "Unauthorized" }, 401);
}

const now = new Date();
const interviewRecordId = crypto.randomUUID();
const uploadResult =
  resume && c.var.user
    ? await storeInterviewResume(interviewRecordId, resume, c.var.user.id)
    : null;
const resumeStorageKey = uploadResult?.storageKey ?? null;
const resumeContentHash = uploadResult?.contentHash ?? null;
```

> 这对应"上传简历必须登录"的合理约束，与读路径的鉴权一致。

- [ ] **Step 2: 更新编辑分支（约 line 964–973）**

定位：

```ts
const analysis = parsedResumePayload;
const now = new Date();
const uploadResult = resume ? await storeInterviewResume(id, resume) : null;
const resumeStorageKey = uploadResult?.storageKey ?? existing.resumeStorageKey;
const resumeContentHash = resume
  ? (uploadResult?.contentHash ?? existing.resumeContentHash)
  : existing.resumeContentHash;
```

替换为：

```ts
if (resume && !c.var.user) {
  return c.json({ error: "Unauthorized" }, 401);
}

const analysis = parsedResumePayload;
const now = new Date();
// 编辑分支不在此处重新分析简历——只更新 storage 引用；analysis 由
// parsedResumePayload 提供或保持原 record 上的快照。
// Edit path: do not re-analyze on resume swap; analysis comes from
// parsedResumePayload or remains the existing snapshot.
const uploadResult =
  resume && c.var.user ? await storeInterviewResume(id, resume, c.var.user.id) : null;
const resumeStorageKey = uploadResult?.storageKey ?? existing.resumeStorageKey;
const resumeContentHash = resume
  ? (uploadResult?.contentHash ?? existing.resumeContentHash)
  : existing.resumeContentHash;
```

> 编辑分支**不**消费 `cachedResumeProfile`——故意：替换简历时 `parsedResumePayload` 会带新的 analysis（来自 resume-import-button 流），手工编辑入口不在编辑里跑分析。

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: 全部清洁（之前 Task 3 引入的两处签名错误现在解了）。

- [ ] **Step 4: lint**

Run: `pnpm check`
Expected: PASS。

- [ ] **Step 5: 全量测试**

Run: `pnpm test`
Expected: 所有 v1 测试继续通过 + Task 1 新加的投影测试通过。

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/interview/route.ts
git commit -m "feat(studio-interview): consume cached resume profile from registry on create"
```

---

## Task 5: 测试 `storeInterviewResume` 三个分支

**Files:**

- Create: `src/server/routes/interview/__tests__/store-interview-resume.test.ts`

覆盖：

1. 命中分支：返回 cached profile，**不**调 `parseResumeFastToProfile`，**不**调 `putObjectBytes`，**不**调 `createAttachment`。
2. 未命中且 parse + PUT 都成功：调 `putObjectBytes` 一次、`parseResumeFastToProfile` 一次、`createAttachment` 一次写注册行，返回新 profile。
3. 未命中且 parse 失败：调 `putObjectBytes` 一次（成功）+ `parseResumeFastToProfile` 一次（rejected），**不**调 `createAttachment`，返回 cachedResumeProfile=null + storageKey 仍非空。

- [ ] **Step 1: 写测试文件**

```ts
// src/server/routes/interview/__tests__/store-interview-resume.test.ts
//
// storeInterviewResume 三个分支的单元测试：注册表命中 / 未命中两步成功 / 未命中 parse 失败。
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAttachmentKeyByHash: vi.fn(),
  createAttachment: vi.fn(),
  findAttachmentByContentHash: vi.fn(),
  parseResumeFastToProfile: vi.fn(),
  projectAttachmentToResumeProfile: vi.fn(),
  putObjectBytes: vi.fn(),
  sha256HexOfBytes: vi.fn(),
}));

vi.mock("@/lib/file-hash", () => ({ sha256HexOfBytes: mocks.sha256HexOfBytes }));
vi.mock("@/lib/s3", () => ({
  buildAttachmentKeyByHash: mocks.buildAttachmentKeyByHash,
  putObjectBytes: mocks.putObjectBytes,
}));
vi.mock("@/server/queries/chat-attachments", () => ({
  createAttachment: mocks.createAttachment,
  findAttachmentByContentHash: mocks.findAttachmentByContentHash,
}));
vi.mock("@/server/agents/resume-analysis-agent", () => ({
  parseResumeFastToProfile: mocks.parseResumeFastToProfile,
  // ResumeAnalysisError 必须真实存在，因为函数内部 instanceof 它。
  ResumeAnalysisError: class ResumeAnalysisError extends Error {
    stage: string;
    constructor(message: string, stage: string) {
      super(message);
      this.stage = stage;
    }
  },
}));
vi.mock("@/server/agents/resume-parser-agent", () => ({
  projectAttachmentToResumeProfile: mocks.projectAttachmentToResumeProfile,
}));

// db 不会被这条函数路径直接调用（cross-table 查询走的是 chat-attachments
// 的封装），但 utils.ts 顶层 import 用到。给个最小 stub。
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/schema", () => ({
  interviewer: {},
  jobDescription: {},
  jobDescriptionInterviewer: {},
  studioInterview: {},
  studioInterviewSchedule: {},
}));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/lib/interview/interview-record", () => ({
  buildCandidateInterviewView: vi.fn(),
  buildInterviewLink: vi.fn(),
  pickCurrentScheduleEntry: vi.fn(),
  sortScheduleEntries: vi.fn(),
}));
vi.mock("@/server/queries/interview-question-templates", () => ({
  ensureApplicableBindings: vi.fn(),
  loadInterviewPresetQuestions: vi.fn(),
}));

import { storeInterviewResume } from "@/server/routes/interview/utils";

const HASH = "a".repeat(64);
const STORAGE_KEY = "chat-attachments/aaa.pdf";

function makeFile(content = "pdf-bytes") {
  return new File([new TextEncoder().encode(content)], "resume.pdf", {
    type: "application/pdf",
  });
}

describe("storeInterviewResume", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }
    mocks.sha256HexOfBytes.mockResolvedValue(HASH);
    mocks.buildAttachmentKeyByHash.mockResolvedValue(STORAGE_KEY);
  });

  it("registry hit: reuses storageKey + cached profile, no PUT, no createAttachment", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue({
      parsedStructured: { name: "郭靖" },
      storageKey: STORAGE_KEY,
    });
    mocks.projectAttachmentToResumeProfile.mockReturnValue({ name: "郭靖" } as never);

    const result = await storeInterviewResume("interview-1", makeFile(), "user-1");

    expect(result).toEqual({
      cachedResumeProfile: { name: "郭靖" },
      contentHash: HASH,
      storageKey: STORAGE_KEY,
    });
    expect(mocks.putObjectBytes).not.toHaveBeenCalled();
    expect(mocks.parseResumeFastToProfile).not.toHaveBeenCalled();
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });

  it("miss + both succeed: PUT + parse + createAttachment, returns fresh profile", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue(null);
    mocks.putObjectBytes.mockResolvedValue(undefined);
    mocks.parseResumeFastToProfile.mockResolvedValue({
      parsedPageCount: 2,
      parsedStructured: { name: "李四" },
      parsedText: "raw",
      parsedTextSource: "qwen-ocr",
      resumeProfile: { name: "李四" } as never,
    });

    const result = await storeInterviewResume("interview-2", makeFile(), "user-2");

    expect(result).toEqual({
      cachedResumeProfile: { name: "李四" },
      contentHash: HASH,
      storageKey: STORAGE_KEY,
    });
    expect(mocks.putObjectBytes).toHaveBeenCalledTimes(1);
    expect(mocks.parseResumeFastToProfile).toHaveBeenCalledTimes(1);
    expect(mocks.createAttachment).toHaveBeenCalledTimes(1);
    expect(mocks.createAttachment.mock.calls[0]?.[0]).toMatchObject({
      contentHash: HASH,
      parsedStatus: "ready",
      parsedStructured: { name: "李四" },
      storageKey: STORAGE_KEY,
      userId: "user-2",
    });
  });

  it("miss + parse fails: PUT succeeds, no createAttachment, profile is null", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue(null);
    mocks.putObjectBytes.mockResolvedValue(undefined);
    mocks.parseResumeFastToProfile.mockRejectedValue(new Error("OCR boom"));

    const result = await storeInterviewResume("interview-3", makeFile(), "user-3");

    expect(result).toEqual({
      cachedResumeProfile: null,
      contentHash: HASH,
      storageKey: STORAGE_KEY,
    });
    expect(mocks.putObjectBytes).toHaveBeenCalledTimes(1);
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });

  it("miss + S3 fails: returns null, no createAttachment", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue(null);
    mocks.putObjectBytes.mockRejectedValue(new Error("S3 boom"));
    mocks.parseResumeFastToProfile.mockResolvedValue({
      parsedPageCount: 1,
      parsedStructured: {},
      parsedText: "",
      parsedTextSource: "qwen-ocr",
      resumeProfile: {} as never,
    });

    const result = await storeInterviewResume("interview-4", makeFile(), "user-4");

    expect(result).toBeNull();
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `pnpm test src/server/routes/interview/__tests__/store-interview-resume.test.ts`
Expected: 4/4 PASS。

> 如果某个 mock 链路串不通（比如 utils.ts 顶层 import 又拉进新依赖），按报错添加额外的 `vi.mock`，但**不要**修 implementation。

- [ ] **Step 3: 全量测试**

Run: `pnpm test`
Expected: 全部通过。

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/interview/__tests__/store-interview-resume.test.ts
git commit -m "test(studio-interview): cover storeInterviewResume registry branches"
```

---

## Task 6: 全量验证

- [ ] **Step 1: typecheck**

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 2: lint**

Run: `pnpm check`
Expected: PASS（0 warnings, 0 errors）。

- [ ] **Step 3: 完整测试套**

Run: `pnpm test`
Expected: 包含 v1 22 个用例 + Task 1 投影测试 4 个 + Task 5 store-interview-resume 测试 4 个 = 至少 30 个用例全 PASS。

- [ ] **Step 4: 手工冒烟**

启动 dev server：

```bash
pnpm dev
```

冒烟矩阵：

1. **chat 上传一份新简历** → 看到 `chat-attachments/{hash}.pdf` S3 PUT；DB 写入 chat_attachment 行（parsedStructured 填好）。
2. **从 chat composer 一键入库到 studio interview**（resume-import-button 流）→ 服务端日志应观察到 `findAttachmentByContentHash` 命中、**不再** PUT 第二个 S3 对象；面试记录创建成功，resumeProfile 字段填充。
3. **手工新建面试，上传新简历**（没在 chat 出现过的 PDF）→ S3 PUT 到 `chat-attachments/{hash}.pdf`（注意是 chat 前缀，不再是 studio-resumes 前缀）；chat_attachment 行写入；面试记录创建成功。
4. **重复第 3 步上传同一份简历到一个新面试** → 命中注册表，不 PUT、不 parse；面试记录创建迅速完成。
5. **chat composer 拖入第 3 步上传过的 PDF**（先经 studio 写入注册表）→ chat preflight 命中，秒返回。
6. **编辑面试替换简历**（替换为另一份新文件）→ 走未命中分支，PUT + parse + 写注册行；面试记录的 storageKey/contentHash 更新。

每一步都看一下浏览器 Network 面板 + 服务端日志确认行为。

- [ ] **Step 5: 终态确认**

```
git status         # 应为 clean
git log --oneline  # 应能看到本计划 5 个 commit + spec commit
```

如有累积修改未提交，看是否合理 → 单独 commit 或 git reset --hard HEAD（仅当确认改动是误差）。

---

## Self-Review Notes

- **Spec 覆盖**：
  - 跨路径 S3 去重：Task 3 ✓
  - 跨路径解析复用：Task 1 + 2 + 4 ✓
  - 不加列：✓（无 schema 改动）
  - 不动老数据：✓（仅触动新写入路径）
  - `analyzeResumeFile` 拆分：Task 2 ✓
  - 边界（PUT-OK + parse-fail）：Task 3 + Task 5 第三个用例 ✓
- **跨任务签名一致性**：`storeInterviewResume` 在 Task 3 定义返回 `{ storageKey, contentHash, cachedResumeProfile } | null`，Task 4 的两个调用点都按这个 shape 解构 ✓。
- **未做的事**（与 spec 一致）：
  - 没改 chat 上传路径（透明继承 v1 行为）。
  - 没动 `studio_interview.resumeProfile` 列类型。
  - 没动 `/api/interview/parse-resume`、`/api/interview/generate-questions` 客户端预解析端点（它们不依赖 storeInterviewResume）。
  - 没删 `studio_interview.resumeContentHash` 列。
- **风险点**：
  - Task 3 的 catch 块捕获了所有 throw 并返回 null（保留 v1 静默 S3 配置缺失语义）；显式 rethrow `ResumeAnalysisError` 以避免吞掉解析错误，让上层 `toBadRequest` 仍能识别。
  - chat 命中 studio 写入的行时 `parsedText` 已经填好（spec 决定写入），所以 chat UI/LLM 流不会读到 NULL。
