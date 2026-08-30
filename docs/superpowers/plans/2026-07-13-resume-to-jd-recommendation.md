# 无编码岗位推荐（简历 → Top-N JD）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 HR 在简历详情页对一份未匹配简历获得「最合适的 Top-N 在招岗位」推荐，并一键绑定；实现现有「JD→候选人」推荐的反向。

**Architecture:** 分两阶段，各自可独立上线。**Phase A（索引旁路）**把 JD 用与简历相同的 3 个 chunk 索引进同一个 Qdrant collection（`sourceType="job_description"`），复用现有 embedding / 状态表 / 队列 / vector store；worker 按 `sourceType` 分流，简历业务路径不动。**Phase B（查询读路径）**镜像 JD→候选人打分内核，方向翻转为检索 `sourceTypes:["job_description"]`，组织隔离在召回时完成、删除兜底在 DB join 时完成，新增端点 + 详情页面板。

**Tech Stack:** TypeScript / Hono / Drizzle ORM / Zod / BullMQ / Qdrant / Vitest（后端）；React 19 / TanStack Query / Hono RPC / shadcn（前端）。

## Global Constraints

- 设计参照 `docs/adr/2026-07-13-jd-recommendation-for-resume-design.md`（已过两轮外部审查）。
- source-type 现有值为 `"resume_pool_item" | "studio_interview"`，本功能新增第三值 `"job_description"`。
- chunk 类型固定 3 个：`"resume_overview" | "skill_role" | "work_project"`。
- 打分权重固定：`skillRole*0.45 + workProject*0.35 + resumeOverview*0.2`，`Math.floor(... * 100)`；阈值 `>= 55`。
- 每 chunk 检索上限沿用 `SEARCH_LIMIT_BY_CHUNK`（`resume_overview:40, skill_role:50, work_project:50`）。
- Qdrant collection 名 `resume_semantic_v1`（cosine, 1024 维），`embeddingVersion` 默认 `"dashscope-text-embedding-v4-1024-v1"`。
- 权限中间件用**内联位置参数**（`requirePermission("scope","action")` 串在路由链里），不是 `.use(...)`。
- 后端 `src/server/` 与 `src/lib/server/` 不得 import web-app `@/` 或 TanStack Start 请求原语。
- 所有 Date 列跨线前 `.toISOString()`；JSON 端点用 `c.json(data, <status>)` 显式状态码 + `zValidator(..., jsonValidatorError("..."))`。
- 命令前缀：后端测试 `pnpm --filter @app/server test`；lint `pnpm fix`。
- Conventional commits；每个 Task 末尾提交一次。

---

# PHASE A — JD 语义索引旁路

> 交付物：JD 在建/改/删时自动进/出 Qdrant（`sourceType="job_description"`），并有回填脚本。可独立上线（此阶段完成后向量库里就有 JD 向量，供 Phase B 消费）。

## Task A1: 扩展 source-type 联合类型与运行时守卫

**Files:**

- Modify: `apps/server/src/lib/server/resume-semantic/vector-store.ts:3`
- Modify: `apps/server/src/lib/server/qdrant/resume-vector-store.ts:127-129`
- Test: `apps/server/src/lib/server/qdrant/resume-vector-store.test.ts`（新增用例，文件若不存在则新建）

**Interfaces:**

- Produces: `ResumeSemanticSourceType` 现含 `"job_description"`；`isSourceType("job_description") === true`（否则 `searchSimilarResumes`/`loadResumeEmbeddings` 会 `flatMap → []` 丢弃 JD 点）。

- [ ] **Step 1: 写失败测试** — 在 `resume-vector-store.test.ts` 增加（若无该测试文件，新建并从 `resume-semantic/qdrant-store.test.ts` 复制其 import 头）：

```ts
import { describe, expect, it } from "vitest";
import { isSourceType } from "./resume-vector-store";
// 若 isSourceType 未导出，本 Task Step 3 需要 export 它

describe("isSourceType", () => {
  it("接受 job_description", () => {
    expect(isSourceType("job_description")).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @app/server test resume-vector-store`
Expected: FAIL（`isSourceType` 未导出，或返回 false）

- [ ] **Step 3: 改联合类型** — `vector-store.ts:3`：

```ts
export type ResumeSemanticSourceType = "resume_pool_item" | "studio_interview" | "job_description";
```

- [ ] **Step 4: 改运行时守卫并导出** — `resume-vector-store.ts:127-129`：

```ts
export function isSourceType(value: unknown): value is ResumeSemanticSourceType {
  return (
    value === "studio_interview" || value === "resume_pool_item" || value === "job_description"
  );
}
```

- [ ] **Step 5: 跑测试确认通过 + 全量 typecheck**

Run: `pnpm --filter @app/server test resume-vector-store && pnpm --filter @app/server typecheck`
Expected: PASS（typecheck 会暴露所有 `switch`/`Record<ResumeSemanticSourceType, ...>` 穷举点；若有编译错误，在对应位置补 `job_description` 分支——记录到本 Task 一并处理）

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/lib/server/resume-semantic/vector-store.ts apps/server/src/lib/server/qdrant/resume-vector-store.ts apps/server/src/lib/server/qdrant/resume-vector-store.test.ts
git commit -m "feat(jd-semantic): add job_description source type to vector store"
```

## Task A2: 抽取 JD 语义文本构建到共享层

`buildJobRecommendationQueryTexts` 现为 `job-descriptions/utils/recommendations.ts` 私有函数（连同 `RecommendJobDescription` 类型、`cleanText`、`section` 助手）。索引旁路与打分内核都要用，抽到 `resume-semantic/text-builders.ts`（`buildResumeSemanticTexts` 所在文件），保持"两侧对称"。

**Files:**

- Modify: `apps/server/src/lib/server/resume-semantic/text-builders.ts`（新增导出 `buildJobDescriptionSemanticTexts` + `JobDescriptionSemanticInput` 类型）
- Modify: `apps/server/src/server/routes/studio/routes/job-descriptions/utils/recommendations.ts`（删除私有实现，改 import）
- Test: `apps/server/src/lib/server/resume-semantic/text-builders.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export interface JobDescriptionSemanticInput {
    departmentName: string | null;
    description: string | null;
    id: string;
    name: string;
    prompt: string;
  }
  export function buildJobDescriptionSemanticTexts(
    jd: JobDescriptionSemanticInput,
  ): ResumeSemanticTextChunk[]; // 3 chunks: resume_overview / work_project / skill_role
  ```
- Consumes（recommendations.ts）: 用 `buildJobDescriptionSemanticTexts` 替换本地 `buildJobRecommendationQueryTexts`；`RecommendJobDescription` 改为复用 `JobDescriptionSemanticInput`（或保留别名 `export type RecommendJobDescription = JobDescriptionSemanticInput`）。

- [ ] **Step 1: 写失败测试** — `text-builders.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { buildJobDescriptionSemanticTexts } from "./text-builders";

describe("buildJobDescriptionSemanticTexts", () => {
  it("从 JD 生成 3 个 chunk，覆盖 name/department/description/prompt", () => {
    const chunks = buildJobDescriptionSemanticTexts({
      departmentName: "算法组",
      description: "负责推荐系统",
      id: "jd-1",
      name: "推荐算法工程师",
      prompt: "考察向量检索经验",
    });
    expect(chunks.map((c) => c.chunkType)).toEqual([
      "resume_overview",
      "work_project",
      "skill_role",
    ]);
    expect(chunks[0].text).toContain("推荐算法工程师");
    expect(chunks[0].text).toContain("算法组");
    expect(chunks[2].text).toContain("考察向量检索经验");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @app/server test text-builders`
Expected: FAIL（`buildJobDescriptionSemanticTexts` 不存在）

- [ ] **Step 3: 迁移实现到 text-builders.ts** — 把 `recommendations.ts:114-155` 的 `cleanText` / `section` / `buildJobRecommendationQueryTexts` 整段搬到 `text-builders.ts`，函数改名 `buildJobDescriptionSemanticTexts`，入参类型改名 `JobDescriptionSemanticInput` 并 `export`。若 `text-builders.ts` 已有同名 `cleanText`/`section`（`buildResumeSemanticTexts` 复用的），则不重复定义、直接用现有的。实现体逐字复制自 recommendations.ts（3 个 chunk 的 `section(...)` 结构照抄，见 ADR 复用清单）。

- [ ] **Step 4: 更新 recommendations.ts** — 删除本地 `buildJobRecommendationQueryTexts` / `RecommendJobDescription` / 迁走的助手；顶部加：

```ts
import {
  buildJobDescriptionSemanticTexts,
  type JobDescriptionSemanticInput,
} from "@app/server/lib/server/resume-semantic/text-builders";
export type RecommendJobDescription = JobDescriptionSemanticInput;
```

将原先调用 `buildJobRecommendationQueryTexts(...)` 处替换为 `buildJobDescriptionSemanticTexts(...)`。

- [ ] **Step 5: 跑测试 + 现有 recommendations 测试确认无回归**

Run: `pnpm --filter @app/server test text-builders recommendations`
Expected: PASS（新测试通过，旧 `recommendations.test.ts` 不变仍绿）

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/lib/server/resume-semantic/text-builders.ts apps/server/src/lib/server/resume-semantic/text-builders.test.ts apps/server/src/server/routes/studio/routes/job-descriptions/utils/recommendations.ts
git commit -m "refactor(jd-semantic): extract buildJobDescriptionSemanticTexts to shared text-builders"
```

## Task A3: JD 内容 hash 模块

镜像 `resume-semantic/profile-hash.ts` 的语义（sha256 稳定序列化）。**注意**：hash 必须覆盖所有进入向量的字段——`name` / `departmentName` / `description` / `prompt`（`departmentName` 进了 `resume_overview` chunk，故必须纳入；ADR 已同步包含这四个字段）。

**Files:**

- Create: `apps/server/src/lib/server/jd-semantic/hash.ts`
- Test: `apps/server/src/lib/server/jd-semantic/hash.test.ts`

**Interfaces:**

- Produces: `export function hashJobDescriptionForSemanticIndex(jd: JobDescriptionSemanticInput): string`

- [ ] **Step 1: 写失败测试** — `hash.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { hashJobDescriptionForSemanticIndex } from "./hash";

const base = {
  departmentName: "算法组",
  description: "负责推荐系统",
  id: "jd-1",
  name: "推荐算法工程师",
  prompt: "考察向量检索经验",
};

describe("hashJobDescriptionForSemanticIndex", () => {
  it("相同语义字段 → 相同 hash（id 不影响）", () => {
    expect(hashJobDescriptionForSemanticIndex(base)).toBe(
      hashJobDescriptionForSemanticIndex({ ...base, id: "jd-2" }),
    );
  });
  it("departmentName 变化 → hash 变化", () => {
    expect(hashJobDescriptionForSemanticIndex(base)).not.toBe(
      hashJobDescriptionForSemanticIndex({ ...base, departmentName: "工程组" }),
    );
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @app/server test jd-semantic/hash`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** — `hash.ts`：

```ts
import { createHash } from "node:crypto";
import type { JobDescriptionSemanticInput } from "@app/server/lib/server/resume-semantic/text-builders";

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function hashJobDescriptionForSemanticIndex(jd: JobDescriptionSemanticInput): string {
  const canonical = {
    departmentName: cleanText(jd.departmentName),
    description: cleanText(jd.description),
    name: cleanText(jd.name),
    prompt: cleanText(jd.prompt),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @app/server test jd-semantic/hash`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/server/jd-semantic/hash.ts apps/server/src/lib/server/jd-semantic/hash.test.ts
git commit -m "feat(jd-semantic): add job description content hash"
```

## Task A4: 扩展队列 schema 的 sourceType enum

复用现有 `resume-semantic-index` 队列（决策：单队列 + worker 分流），只加 enum 值。

**Files:**

- Modify: `packages/resume-parse-queue/src/resume-semantic-index.ts:15-24`
- Test: `packages/resume-parse-queue/src/resume-semantic-index.test.ts`（若无则新建）

**Interfaces:**

- Produces: `resumeSemanticIndexJobSchema` 的 `sourceType` 现接受 `"job_description"`；`ResumeSemanticIndexJobData["sourceType"]` 类型随之扩展（`upsertResumeSemanticIndexState` 的 `sourceType` 参数、`buildResumeSemanticIndexJobId` 自动兼容）。

- [ ] **Step 1: 写失败测试**：

```ts
import { describe, expect, it } from "vitest";
import { resumeSemanticIndexJobSchema } from "./resume-semantic-index";

describe("resumeSemanticIndexJobSchema", () => {
  it("接受 job_description sourceType", () => {
    const parsed = resumeSemanticIndexJobSchema.parse({
      organizationId: "org-1",
      sourceId: "jd-1",
      sourceType: "job_description",
    });
    expect(parsed.sourceType).toBe("job_description");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/resume-parse-queue test resume-semantic-index`
Expected: FAIL（enum 拒绝 job_description）

- [ ] **Step 3: 改 enum** — `resume-semantic-index.ts:18`：

```ts
sourceType: z.enum(["studio_interview", "resume_pool_item", "job_description"]),
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/resume-parse-queue test resume-semantic-index`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/resume-parse-queue/src/resume-semantic-index.ts packages/resume-parse-queue/src/resume-semantic-index.test.ts
git commit -m "feat(queue): allow job_description in resume-semantic-index job schema"
```

## Task A5: JD 索引器（runJdSemanticIndexJob + prepare + loadSource）

镜像 `resume-semantic/indexer.ts` 的 `runResumeSemanticIndexJob` / `prepareResumeSemanticIndexJob`，但 **不改动** resume indexer。JD indexer 自带 `loadSource`（查 JD + department），用 `buildJobDescriptionSemanticTexts` 建文本、`hashJobDescriptionForSemanticIndex` 算 hash，复用 `upsertResumeSemanticIndexState`（状态表）与 `QdrantResumeVectorStore`（向量库）。

**Files:**

- Create: `apps/server/src/lib/server/jd-semantic/indexer.ts`
- Test: `apps/server/src/lib/server/jd-semantic/indexer.test.ts`

**Interfaces:**

- Consumes: `hashJobDescriptionForSemanticIndex`(A3), `buildJobDescriptionSemanticTexts`(A2), `upsertResumeSemanticIndexState` / `getResumeSemanticIndexConfig`（`resume-semantic/indexer.ts` 导出）, `QdrantResumeVectorStore`, `embedResumeSemanticTexts`, `getResumeEmbeddingConfig`。
- Produces:

  ```ts
  export interface JdSemanticIndexJob {
    organizationId: string;
    sourceId: string;
    sourceType: "job_description";
  }
  export function runJdSemanticIndexJob(
    job: JdSemanticIndexJob,
    deps?: JdIndexerDeps,
  ): Promise<void>;
  export function prepareJdSemanticIndexJob(
    job: JdSemanticIndexJob,
    deps?: JdIndexerDeps,
  ): Promise<boolean>;
  export function createDefaultJdIndexerDeps(): JdIndexerDeps;
  ```

- [ ] **Step 1: 写失败测试** — `indexer.test.ts`，镜像 `resume-semantic/indexer.test.ts` 的 mock 风格。`deps` 全注入（`loadSource` / `embed` / `vectorStore` / `readIndexState` / `markIndexed` / `markFailed` / `markSkipped` / `getConfig`）：

```ts
import { describe, expect, it, vi } from "vitest";
import { runJdSemanticIndexJob } from "./indexer";

const job = { organizationId: "org-1", sourceId: "jd-1", sourceType: "job_description" as const };
const jd = { departmentName: "算法组", description: "d", id: "jd-1", name: "n", prompt: "p" };
const config = {
  apiKey: "k",
  baseUrl: "b",
  dimensions: 2,
  model: "m",
  embeddingVersion: "v1",
  qdrantApiKey: null,
  qdrantCollectionName: "c",
  qdrantUrl: "u",
};

const baseDeps = () => ({
  embed: vi.fn(({ chunks }) => Promise.resolve(chunks.map((c) => ({ ...c, embedding: [1, 2] })))),
  getConfig: () => config,
  loadSource: vi.fn(() => Promise.resolve(jd)),
  markFailed: vi.fn(() => Promise.resolve()),
  markIndexed: vi.fn(() => Promise.resolve()),
  markSkipped: vi.fn(() => Promise.resolve()),
  readIndexState: vi.fn(() => Promise.resolve(null)),
  vectorStore: {
    deleteResumeEmbeddings: vi.fn(() => Promise.resolve()),
    ensureCollection: vi.fn(() => Promise.resolve()),
    searchSimilarResumes: vi.fn(() => Promise.resolve([])),
    upsertResumeEmbeddings: vi.fn(() => Promise.resolve()),
  },
});

describe("runJdSemanticIndexJob", () => {
  it("首次索引 → embed + upsert(sourceType=job_description) + markIndexed", async () => {
    const deps = baseDeps();
    await runJdSemanticIndexJob(job, deps);
    expect(deps.vectorStore.upsertResumeEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "job_description", sourceId: "jd-1" }),
    );
    expect(deps.markIndexed).toHaveBeenCalled();
  });

  it("hash 未变且已 indexed → 跳过", async () => {
    const deps = baseDeps();
    // 先算出稳定 hash 再塞进 readIndexState
    const { hashJobDescriptionForSemanticIndex } = await import("./hash");
    deps.readIndexState = vi.fn(() =>
      Promise.resolve({ profileHash: hashJobDescriptionForSemanticIndex(jd), status: "indexed" }),
    );
    await runJdSemanticIndexJob(job, deps);
    expect(deps.vectorStore.upsertResumeEmbeddings).not.toHaveBeenCalled();
    expect(deps.markIndexed).not.toHaveBeenCalled();
  });

  it("source 缺失 → markSkipped，不 upsert", async () => {
    const deps = baseDeps();
    deps.loadSource = vi.fn(() => Promise.resolve(null));
    await runJdSemanticIndexJob(job, deps);
    expect(deps.markSkipped).toHaveBeenCalled();
    expect(deps.vectorStore.upsertResumeEmbeddings).not.toHaveBeenCalled();
  });

  it("embed 抛错 → markFailed 并 rethrow", async () => {
    const deps = baseDeps();
    deps.embed = vi.fn(() => Promise.reject(new Error("boom")));
    await expect(runJdSemanticIndexJob(job, deps)).rejects.toThrow("boom");
    expect(deps.markFailed).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @app/server test jd-semantic/indexer`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 indexer.ts** — 结构逐段镜像 `resume-semantic/indexer.ts:176-244`（`runResumeSemanticIndexJob`）与 `:109-149`（`prepareResumeSemanticIndexJob`）。核心体：

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@app/server/lib/server/db";
import { department, jobDescription, resumeSemanticIndex } from "@arc/db-schema/schema";
import { embedResumeSemanticTexts } from "@app/server/lib/server/resume-semantic/embedding";
import { getResumeEmbeddingConfig } from "@app/server/lib/server/resume-semantic/embedding";
// 注意：markSemanticIndexIndexed/Failed/Skipped 在 indexer.ts 中【未 export】——只能用已导出的
// upsertResumeSemanticIndexState 与 getResumeSemanticIndexConfig，JD 侧自定义薄 marker 委托前者。
import {
  getResumeSemanticIndexConfig,
  upsertResumeSemanticIndexState,
} from "@app/server/lib/server/resume-semantic/indexer";
import {
  buildJobDescriptionSemanticTexts,
  type JobDescriptionSemanticInput,
} from "@app/server/lib/server/resume-semantic/text-builders";
import { QdrantResumeVectorStore } from "@app/server/lib/server/qdrant/resume-vector-store";
import { hashJobDescriptionForSemanticIndex } from "./hash";

export interface JdSemanticIndexJob {
  organizationId: string;
  sourceId: string;
  sourceType: "job_description";
}

// deps 接口镜像 resume-semantic/indexer.ts 的 ResumeSemanticIndexerDeps（getConfig/loadSource/
// embed/vectorStore/readIndexState/markIndexed/markFailed/markSkipped），loadSource 返回
// JobDescriptionSemanticInput | null。

async function loadJdSource(job: JdSemanticIndexJob): Promise<JobDescriptionSemanticInput | null> {
  const [row] = await db
    .select({
      departmentName: department.name,
      description: jobDescription.description,
      id: jobDescription.id,
      name: jobDescription.name,
      prompt: jobDescription.prompt,
    })
    .from(jobDescription)
    .leftJoin(department, eq(department.id, jobDescription.departmentId))
    .where(
      and(
        eq(jobDescription.id, job.sourceId),
        eq(jobDescription.organizationId, job.organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}
```

`runJdSemanticIndexJob` 流程（照抄 resume 版语义，把 `hashResumeProfileForSemanticIndex`→`hashJobDescriptionForSemanticIndex`，`buildResumeSemanticTexts`→`buildJobDescriptionSemanticTexts`，`sourceType` 恒为 `"job_description"`，复用状态表的 `profileHash` 列存 JD hash——**须在写入处加注释**「此处 profileHash 复用列名，JD 侧存的是 JD 内容 hash，非 resume profile」，防维护者误解，`contentHash: null`）：

```ts
export async function runJdSemanticIndexJob(
  job: JdSemanticIndexJob,
  deps: JdIndexerDeps = createDefaultJdIndexerDeps(),
): Promise<void> {
  const config = deps.getConfig();
  const source = await deps.loadSource(job);
  if (!source) {
    await deps.markSkipped({
      ...job,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      profileHash: "skipped",
      reason: "job description not found",
    });
    return;
  }
  const profileHash = hashJobDescriptionForSemanticIndex(source);
  // readIndexState 的 WHERE 只用 (sourceType, sourceId, embeddingVersion)——profileHash 只被
  // SELECT 返回、不参与过滤（镜像 resume 版 readSemanticIndexState:327-348），所以 hash 变化时
  // 仍能读到旧 indexed 行，再由下面的 existing.profileHash===profileHash 比较决定是否跳过。
  const existing = await deps.readIndexState({
    embeddingVersion: config.embeddingVersion,
    profileHash,
    sourceId: job.sourceId,
    sourceType: job.sourceType,
  });
  if (existing?.status === "indexed" && existing.profileHash === profileHash) {
    return;
  }
  try {
    const texts = buildJobDescriptionSemanticTexts(source);
    const embeddings = await deps.embed({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      chunks: texts,
      dimensions: config.dimensions,
      model: config.model,
    });
    await deps.vectorStore.ensureCollection();
    await deps.vectorStore.upsertResumeEmbeddings({
      chunks: embeddings,
      contentHash: null,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      organizationId: job.organizationId,
      profileHash,
      sourceId: job.sourceId,
      sourceType: job.sourceType,
      status: "active",
    });
    await deps.markIndexed({
      ...job,
      contentHash: null,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      profileHash,
    });
  } catch (error) {
    await deps.markFailed({
      ...job,
      contentHash: null,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      errorMessage: error instanceof Error ? error.message : String(error),
      profileHash,
    });
    throw error;
  }
}
```

`prepareJdSemanticIndexJob`：镜像 resume 版——`loadSource`→算 hash→`readIndexState`，若已 indexed 且 hash 一致返回 `false`，否则 `markPending`（用 `upsertResumeSemanticIndexState({..., status:"pending", errorMessage:null, contentHash:null})`）返回 `true`。`markIndexed`/`markFailed`/`markSkipped` 默认实现**直接委托已导出的 `upsertResumeSemanticIndexState`**（因 `markSemanticIndex*` 未 export），语义对齐：indexed→`{status:"indexed", errorMessage:null}`；failed→`{status:"failed", errorMessage}`；skipped→`{status:"skipped", contentHash:null, errorMessage:reason}`。`createDefaultJdIndexerDeps` 用 `getResumeSemanticIndexConfig()` + `new QdrantResumeVectorStore({...})`（构造照抄 A2 引用报告的 canonical 模式）+ `embed: embedResumeSemanticTexts`。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @app/server test jd-semantic/indexer`
Expected: PASS（4 个用例）

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/server/jd-semantic/indexer.ts apps/server/src/lib/server/jd-semantic/indexer.test.ts
git commit -m "feat(jd-semantic): add JD semantic indexer job"
```

## Task A6: 最佳努力入队 + 删除助手

镜像 `resume-semantic/enqueue.ts`（`enqueueResumeSemanticIndexJobBestEffort`）与 `lifecycle.ts:73`（`deleteResumeSemanticIndexBestEffort`）。入队失败**打结构化日志**（jdId + 原因）——ADR 可观测性要求。

**Files:**

- Create: `apps/server/src/lib/server/jd-semantic/enqueue.ts`
- Test: `apps/server/src/lib/server/jd-semantic/enqueue.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export function enqueueJobDescriptionIndexJobBestEffort(input: {
    organizationId: string;
    jobDescriptionId: string | null | undefined;
  }): Promise<void>;
  export function deleteJobDescriptionSemanticIndexBestEffort(input: {
    organizationId: string;
    jobDescriptionId: string;
  }): Promise<void>;
  ```

- [ ] **Step 1: 写失败测试** — 覆盖入队与删除两个助手（下方示例仅入队分支，另需补删除助手用例）：
  - 入队：功能未启用 → 静默返回不抛；`jobDescriptionId` 为空 → 静默返回。
  - 删除（`deleteJobDescriptionSemanticIndexBestEffort`，用 `vi.mock` 掉动态 import 的 `getResumeSemanticIndexConfig` 与 `QdrantResumeVectorStore`）：(1) 有 qdrantUrl → 调 `store.deleteResumeEmbeddings({ sourceType:"job_description", sourceId })` 且删 `resumeSemanticIndex` 状态行；(2) 无 qdrantUrl → 直接返回不抛；(3) store 抛错 → 被 `console.warn` 吞掉、`resolves` 不抛（断言 `console.warn` 被调用，验证结构化日志）。

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/server/lib/server/resume-semantic/embedding", () => ({
  isResumeSemanticIndexEnabled: () => false,
}));

describe("enqueueJobDescriptionIndexJobBestEffort", () => {
  it("功能未启用 → 静默返回不抛", async () => {
    const { enqueueJobDescriptionIndexJobBestEffort } = await import("./enqueue");
    await expect(
      enqueueJobDescriptionIndexJobBestEffort({
        jobDescriptionId: "jd-1",
        organizationId: "org-1",
      }),
    ).resolves.toBeUndefined();
  });
  it("jobDescriptionId 为空 → 静默返回", async () => {
    const { enqueueJobDescriptionIndexJobBestEffort } = await import("./enqueue");
    await expect(
      enqueueJobDescriptionIndexJobBestEffort({ jobDescriptionId: null, organizationId: "org-1" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @app/server test jd-semantic/enqueue`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 enqueue.ts**（逐字镜像 resume enqueue，dynamic import 惰性加载队列，`sourceType:"job_description"`，`prepareJdSemanticIndexJob` 决定是否入队，`enqueueResumeSemanticIndexJobs` 复用；catch 里 `console.warn("[jd-semantic-index] enqueue failed", { jobDescriptionId, reason })`）：

```ts
import { isResumeSemanticIndexEnabled } from "@app/server/lib/server/resume-semantic/embedding";

export async function enqueueJobDescriptionIndexJobBestEffort(input: {
  organizationId: string;
  jobDescriptionId: string | null | undefined;
}): Promise<void> {
  if (!(input.jobDescriptionId && isResumeSemanticIndexEnabled())) {
    return;
  }
  const job = {
    organizationId: input.organizationId,
    sourceId: input.jobDescriptionId,
    sourceType: "job_description" as const,
  };
  try {
    const { prepareJdSemanticIndexJob } = await import("./indexer");
    if (!(await prepareJdSemanticIndexJob(job))) {
      return;
    }
    const { enqueueResumeSemanticIndexJobs } =
      await import("@arc/resume-parse-queue/resume-semantic-index");
    await enqueueResumeSemanticIndexJobs([job]);
  } catch (error) {
    console.warn("[jd-semantic-index] enqueue failed", {
      jobDescriptionId: input.jobDescriptionId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deleteJobDescriptionSemanticIndexBestEffort(input: {
  organizationId: string;
  jobDescriptionId: string;
}): Promise<void> {
  try {
    const { getResumeSemanticIndexConfig } =
      await import("@app/server/lib/server/resume-semantic/indexer");
    const { QdrantResumeVectorStore } =
      await import("@app/server/lib/server/qdrant/resume-vector-store");
    const cfg = getResumeSemanticIndexConfig();
    if (!cfg.qdrantUrl) {
      return;
    }
    const store = new QdrantResumeVectorStore({
      apiKey: cfg.qdrantApiKey,
      collectionName: cfg.qdrantCollectionName,
      dimensions: cfg.dimensions,
      url: cfg.qdrantUrl,
    });
    await store.deleteResumeEmbeddings({
      sourceId: input.jobDescriptionId,
      sourceType: "job_description",
    });
    // 同时删状态行（镜像 resume lifecycle）：delete resumeSemanticIndex where sourceType/sourceId/org
  } catch (error) {
    console.warn("[jd-semantic-index] delete failed", {
      jobDescriptionId: input.jobDescriptionId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
```

删状态行部分参照 `resume-semantic/lifecycle.ts` 的 `deleteResumeSemanticIndex` 实现（`db.delete(resumeSemanticIndex).where(and(eq(sourceType,"job_description"), eq(sourceId,...), eq(organizationId,...)))`）。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @app/server test jd-semantic/enqueue`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/server/jd-semantic/enqueue.ts apps/server/src/lib/server/jd-semantic/enqueue.test.ts
git commit -m "feat(jd-semantic): add best-effort enqueue/delete helpers"
```

## Task A7: worker 分流分派

在 worker 注入 processor 处按 `sourceType` 分流；**不改** `runResumeSemanticIndexJob`。

**Files:**

- Modify: `apps/worker/src/index.ts:89-96`

**Interfaces:**

- Consumes: `runJdSemanticIndexJob`(A5)。

- [ ] **Step 1: 改分派块** — 把现有：

```ts
semanticIndexWorker = createResumeSemanticIndexWorker(async (payload) => {
  const { runResumeSemanticIndexJob } =
    await import("@app/server/lib/server/resume-semantic/indexer");
  await runResumeSemanticIndexJob(payload);
});
```

改为：

```ts
semanticIndexWorker = createResumeSemanticIndexWorker(async (payload) => {
  if (payload.sourceType === "job_description") {
    const { runJdSemanticIndexJob } = await import("@app/server/lib/server/jd-semantic/indexer");
    await runJdSemanticIndexJob(payload);
    return;
  }
  const { runResumeSemanticIndexJob } =
    await import("@app/server/lib/server/resume-semantic/indexer");
  await runResumeSemanticIndexJob(payload);
});
```

（`recoverIncompleteResumeSemanticIndexJobs` 无需改：它按 status 选行、经同一队列重入，JD 行会自然流到此分派。）

- [ ] **Step 2: typecheck 确认无错**

Run: `pnpm --filter @app/worker typecheck`
Expected: PASS（`payload.sourceType` 已含 `job_description`，`runJdSemanticIndexJob` 入参匹配）

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "feat(worker): dispatch job_description jobs to JD semantic indexer"
```

## Task A8: JD CRUD 路由钩子

在 `job-descriptions/route.ts` 的建/改/删成功返回前挂 best-effort 钩子（`safeUpdateTag` 之后、`return` 之前）。

**Files:**

- Modify: `apps/server/src/server/routes/studio/routes/job-descriptions/route.ts`（create ~343、patch ~510、delete ~549）

**Interfaces:**

- Consumes: `enqueueJobDescriptionIndexJobBestEffort` / `deleteJobDescriptionSemanticIndexBestEffort`(A6)。

- [ ] **Step 0: 确认写入口齐全** — `grep -rn "insert(jobDescription)\|update(jobDescription)\|delete(jobDescription)" apps/` 确认 JD 的建/改/删只经这三个 handler；若存在其他写入口（如批量导入、迁移脚本），一并挂钩或记录为已知缺口，避免 JD 向量漏更新。

- [ ] **Step 1: 顶部加 import**：

```ts
import {
  deleteJobDescriptionSemanticIndexBestEffort,
  enqueueJobDescriptionIndexJobBestEffort,
} from "@app/server/lib/server/jd-semantic/enqueue";
```

- [ ] **Step 2: create（`.post`）** — 在 `return c.json(serializeJobDescription(record, interviewerIds), 201);` 之前插：

```ts
await enqueueJobDescriptionIndexJobBestEffort({
  jobDescriptionId: record.id,
  organizationId: activeOrg.id,
});
```

- [ ] **Step 3: patch（`.patch("/:id")`）** — 在 `return c.json(updated, 200);` 之前插：

```ts
await enqueueJobDescriptionIndexJobBestEffort({
  jobDescriptionId: id,
  organizationId: activeOrg.id,
});
```

- [ ] **Step 4: delete（`.delete("/:id")`）** — 在 `return c.json({ success: true }, 200);` 之前插：

```ts
await deleteJobDescriptionSemanticIndexBestEffort({
  jobDescriptionId: id,
  organizationId: activeOrg.id,
});
```

- [ ] **Step 5: 写钩子调用测试**（`.../job-descriptions/__tests__/index-hooks.test.ts`；testClient + `vi.mock` 掉 `jd-semantic/enqueue`，断言真实被调用，不用 typecheck 兜底）——三条：(1) POST 建 JD → `enqueueJobDescriptionIndexJobBestEffort` 被调用一次且 `{ jobDescriptionId: record.id, organizationId: activeOrg.id }`（校验 org id 正确、非他组织）；(2) PATCH 改 JD → 同样以正确 id+org 入队；(3) DELETE JD → `deleteJobDescriptionSemanticIndexBestEffort` 被调用一次（校验删除清理确实触发）。注意：钩子本身内部 try/catch 吞错、**永不抛**（A6 已验证），故路由只 `await` 它即安全、**不需要 route 层 catch**；因此本测试**不** mock 钩子抛错（那是不可达场景），"best-effort 不阻断 CRUD"由 A6 的吞错测试覆盖，不在此重复。

Run: `pnpm --filter @app/server test job-descriptions && pnpm --filter @app/server typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/server/routes/studio/routes/job-descriptions/route.ts apps/server/src/server/routes/studio/routes/job-descriptions/__tests__/index-hooks.test.ts
git commit -m "feat(jd-semantic): index JD on create/update, purge on delete"
```

## Task A9: 存量回填脚本

镜像 `scripts/backfill-resume-semantic-index.ts`，改为按组织加载 JD 并入队。

**Files:**

- Create: `apps/server/src/scripts/backfill-jd-semantic-index.ts`

**Interfaces:**

- Consumes: `runJdSemanticIndexJob`(A5)。

- [ ] **Step 1: 复制并改写** — 以 `backfill-resume-semantic-index.ts` 为模板，做以下替换（其余并发 runner / env bootstrap / CLI 入口逐字保留）：
  - 记录加载器改为查 `jobDescription`（无需 `resumeParseStatus` 门槛；JD 只要行存在即可索引），映射为 `{ organizationId, sourceId: jd.id, sourceType: "job_description" }`。
  - `notAlreadyIndexedCondition` 的 `sourceType` 传 `"job_description"`。
  - `indexRecord: runJdSemanticIndexJob`（import 自 jd-semantic/indexer）。
  - target 简化为 `"all"`（JD 无 pool/studio 之分）。
  - 环境变量前缀改 `BACKFILL_JD_SEMANTIC_*`。

- [ ] **Step 2: 注册可执行入口** — 在 backend `package.json` `scripts` 加 `"backfill:jd-semantic": "tsx src/scripts/backfill-jd-semantic-index.ts"`（镜像现有 `backfill:resume-semantic` 若有；runner 名以现有 resume 脚本的注册方式为准）。验收即 `pnpm --filter @app/server backfill:jd-semantic`（配好 env 后）跑通、日志出 `backfill_finished`。

- [ ] **Step 3: 冒烟验证脚本可加载**（不实际连库）：

Run: `pnpm --filter @app/server typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/scripts/backfill-jd-semantic-index.ts apps/server/package.json
git commit -m "feat(jd-semantic): add backfill script for existing JDs"
```

**Phase A 验收**：设 `RESUME_SEMANTIC_INDEX_ENABLED=1` + Qdrant/embedding 配置后，建/改一个 JD → worker 日志出现 job_description 索引；`backfill-jd-semantic-index` 跑通把存量 JD 入库；Qdrant 中出现 `sourceType=job_description` 的点。

---

# PHASE B — 简历→JD 推荐读路径 + 前端

> 依赖 Phase A（向量库里有 JD 向量）。交付物：`POST /:id/recommendations` 端点 + 详情页「推荐岗位」面板 + 一键绑定。

> ✅ **绑定语义已定：选项 A（新增轻量绑定端点）**。经核实：`resumePoolItem.jobDescriptionId`（schema:1026）与 `studioInterview.jobDescriptionId`（schema:440）是两个不同的列/两种不同"匹配"。`POST /:id/import` + `jobDescriptionMode:"bind"`（`importPoolItemToResumeLibrary`, `dao.ts:545`）**不写 pool item 自身的 jobDescriptionId**，而是新建 studioInterview 库记录 + review 生成 + 去重——语义是"入库开筛"，且不满足决策 5（隐藏面板 gate 读的是 `resumePoolItem.jobDescriptionId`）。无任何现成端点单独回填该列。故新增 **B5 后端绑定端点** `POST /:id/bind`（仅 UPDATE `resumePoolItem.jobDescriptionId` + 校验 JD 属组织 + 写 resumePoolEvent），前端 B6 调它绑定。

## Task B1: 共享 DTO

**Files:**

- Modify: `packages/shared/src/job-descriptions.ts`
- Test: `packages/shared/src/job-descriptions.test.ts`（若无则跳过测试，靠 typecheck）

**Interfaces:**

- Produces:

  ```ts
  export interface JobDescriptionRecommendation {
    departmentName: string | null;
    description: string | null; // 摘要
    id: string;
    name: string;
    reasons: string[];
    score: number;
    similarity: { resumeOverview?: number; skillRole?: number; workProject?: number };
  }
  export interface JobDescriptionRecommendationResult {
    diagnostics: { filteredByThreshold: number; vectorHitCount: number };
    recommendations: JobDescriptionRecommendation[];
    resume: { id: string };
    status: "disabled" | "ready" | "already_matched" | "indexing";
  }
  ```

- [ ] **Step 1: 加类型**（追加到 `job-descriptions.ts`，勿改现有 `JobDescriptionTalentRecommendationResult`）：见上 Produces 块，逐字加入。

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @arc/shared typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/job-descriptions.ts
git commit -m "feat(shared): add JobDescriptionRecommendation DTO for resume->JD"
```

## Task B2: 推荐打分内核

镜像 `job-descriptions/utils/recommendations.ts` 的 `scoreCandidatesForJobDescription` / `recommendCandidatesForJobDescription`，方向翻转。**组织隔离在召回时**（`searchSimilarResumes({ organizationId, sourceTypes:["job_description"] })`）；**删除兜底在展示 join 时**（`loadJobDescriptionsForDisplay` 查 DB，行不存在即掉出）。简历向量优先 `loadResumeEmbeddings`（真复用），未索引时**现场 embed 带超时**。

**本 Task 先抽取共享打分工具**（决策：抽共享 helper，避免两侧逻辑漂移 / 评审判重复）：把 `recommendations.ts` 里的 `SEARCH_LIMIT_BY_CHUNK`、`mergeVectorScores`、`weightedScore`、`VectorScores` 抽到新建 `resume-semantic/scoring.ts`，`recommendations.ts` 改为 import（删本地副本），`jd-recommendations.ts` 也 import。`mergeVectorScores` 参数化 sourceType（JD 侧传 `"job_description"`，候选人侧传 `"studio_interview"`）。**不得逐字复制这三段逻辑。**

**Files:**

- Create: `apps/server/src/lib/server/resume-semantic/scoring.ts`（共享 `SEARCH_LIMIT_BY_CHUNK` / `mergeVectorScores(results, sourceType)` / `weightedScore` / `VectorScores`）
- Modify: `apps/server/src/server/routes/studio/routes/job-descriptions/utils/recommendations.ts`（删本地三段、改 import `scoring.ts`，`mergeVectorScores(..., "studio_interview")`）
- Create: `apps/server/src/server/routes/studio/routes/resume-pool/utils/jd-recommendations.ts`
- Test: `apps/server/src/lib/server/resume-semantic/scoring.test.ts`（新，测 merge 参数化 + 权重）
- Test: `apps/server/src/server/routes/studio/routes/resume-pool/utils/jd-recommendations.test.ts`

**Interfaces:**

- Consumes: `loadResumeEmbeddings`/`searchSimilarResumes`（`QdrantResumeVectorStore`）, `buildResumeSemanticTexts`, `embedResumeSemanticTexts`, `getResumeEmbeddingConfig`, `getResumeSemanticIndexConfig`, `isResumeSemanticIndexEnabled`, `JobDescriptionRecommendationResult`(B1), **`SEARCH_LIMIT_BY_CHUNK`/`mergeVectorScores`/`weightedScore`（本 Task 新建的 `scoring.ts`）**。
- Produces（除下方推荐函数外，另导出共享 `scoring.ts`）: `SEARCH_LIMIT_BY_CHUNK`、`mergeVectorScores(results: ResumeVectorSearchResult[], sourceType: ResumeSemanticSourceType): Map<string, VectorScores>`、`weightedScore(scores: VectorScores): number`。
- Produces:

  ```ts
  export interface RecommendJdInput {
    organizationId: string;
    resume: { id: string; jobDescriptionId: string | null; profile: ResumeProfile | null };
    topN: number;
  }
  export function scoreJobDescriptionsForResume(
    input,
    deps?,
  ): Promise<{ ranked: JdRankedEntry[]; retrievedIds: Set<string>; loadedIds: Set<string> }>;
  export function recommendJobDescriptionsForResume(
    input: RecommendJdInput,
    deps?,
  ): Promise<JobDescriptionRecommendationResult>;
  export function createDefaultJdRecommendationDeps(): JdRecommendationDeps;
  ```

  `deps` 镜像 `RecommendationDeps`，另加 `loadResumeChunks(input): Promise<ResumeStoredEmbeddingChunk[]>`（默认 `vectorStore.loadResumeEmbeddings`）、`enqueueResumeReindex(input: { organizationId: string; sourceId: string }): Promise<void>`（默认 best-effort 入队 resume_pool_item 重索引，供 fallback 用）、`countIndexedJdVectors(organizationId: string): Promise<number>`（默认查 resume_semantic_index 已索引 JD 行数，供 `indexing(b)` 判定）与 `loadJobDescriptionsForDisplay(orgId, ids): Promise<JobDescriptionDisplayRow[]>`。测试的 `depsWith` 需补 `enqueueResumeReindex`/`countIndexedJdVectors` 的 `vi.fn`，并在「现场 embed 回退」断言 `enqueueResumeReindex` 被调用。

- [ ] **Step 0: 抽取共享 `scoring.ts`（先做，含护栏）** —
  1. 新建 `resume-semantic/scoring.ts`，从 `recommendations.ts:108-112/157-183` 迁入 `SEARCH_LIMIT_BY_CHUNK`、`VectorScores`、`mergeVectorScores`、`weightedScore`；`mergeVectorScores` 签名改 `(results, expectedSourceType)`，guard 用参数 `if (r.sourceType !== expectedSourceType) continue`。
  2. 写 `scoring.test.ts`：`mergeVectorScores` 按传入 sourceType 过滤（传 `"job_description"` 只并 JD 命中）、`weightedScore` 权重（0.9/0.8/0.7→82）。
  3. 改 `recommendations.ts`：删本地三段，import `scoring.ts`，调用处 `mergeVectorScores(results, "studio_interview")`。
  4. 跑 `pnpm --filter @app/server test scoring recommendations` → **两者皆绿**（recommendations.test.ts 无回归 = 抽取正确的护栏）。

- [ ] **Step 1: 写失败测试** — 镜像 `recommendations.test.ts` 的 `depsWith` 工厂，`searchSimilarResumes` 返回 `sourceType:"job_description"`。覆盖用例：
  1. 加权：per-chunk skill_role=0.9/work_project=0.8/resume_overview=0.7 → `score===82`；`status:"ready"`。
  2. 阈值：全 0.2 → `recommendations` 空。
  3. topN 截断。
  4. **组织隔离**：断言 `searchSimilarResumes` 以 `organizationId` + `sourceTypes:["job_description"]` 调用。
  5. **删除兜底**：向量命中 `jd-x` 但 `loadJobDescriptionsForDisplay` 不返回该行 → 结果里无 `jd-x`。
  6. **already_matched**：`resume.jobDescriptionId` 非空 → `status:"already_matched"`、`recommendations:[]`，且 `searchSimilarResumes` 未被调用。
  7. **disabled**：`enabled:false` → `status:"disabled"`。
  8. **现场 embed 回退**：`loadResumeChunks` 返回 `[]` 且 `profile` 存在 → 先调 `enqueueResumeReindex`（断言被调用），再 `embed`（fallback）后正常检索。
  9. **embed 超时**：`embed` 超时（reject/超 deadline）→ `status:"indexing"`，不抛。
  10. **部分 chunk 缺失优雅降级**：`loadResumeChunks` 只返回 2 个 chunk（如缺 `work_project`）→ 不崩、仍返回 `ready`，缺失 facet 在 `weightedScore` 记 0（分数偏低但稳定），固化该行为。
  11. **indexing(b) 区分**：0 命中 + `countIndexedJdVectors`→0 → `status:"indexing"`；0 命中 + `countIndexedJdVectors`→>0 → `status:"ready"` 空。
      （用例 2/3/8/10/11 的断言细节须写全，勿只留桩——codex 指出示例代码只覆盖 6/10 个。）

```ts
import { describe, expect, it, vi } from "vitest";
import { recommendJobDescriptionsForResume } from "./jd-recommendations";

const profile = {
  /* 最小 ResumeProfile fixture，参照 recommendations.test.ts:15-44 */
} as never;
const jdRow = (id: string) => ({
  departmentName: "算法组",
  description: "d",
  id,
  name: `JD-${id}`,
});

const depsWith = (opts: {
  chunks?: unknown[];
  search?: (a: { chunkType: string }) => number;
  displayIds?: string[];
  hitIds?: string[];
  enabled?: boolean;
  embed?: () => Promise<unknown>;
  indexedJdCount?: number;
}) => ({
  embed:
    opts.embed ??
    vi.fn(({ chunks }: { chunks: { chunkType: string }[] }) =>
      Promise.resolve(chunks.map((c) => ({ ...c, embedding: [1, 2] }))),
    ),
  countIndexedJdVectors: vi.fn(() => Promise.resolve(opts.indexedJdCount ?? 1)),
  embeddingConfig: { apiKey: "k", baseUrl: "b", dimensions: 2, model: "m" },
  embeddingVersion: "v1",
  enabled: opts.enabled ?? true,
  enqueueResumeReindex: vi.fn(() => Promise.resolve()),
  loadJobDescriptionsForDisplay: vi.fn((_org: string, ids: string[]) =>
    Promise.resolve(ids.filter((id) => (opts.displayIds ?? ids).includes(id)).map(jdRow)),
  ),
  loadResumeChunks: vi.fn(() =>
    Promise.resolve(
      opts.chunks ?? [
        { chunkType: "resume_overview", embedding: [1, 2] },
        { chunkType: "skill_role", embedding: [1, 2] },
        { chunkType: "work_project", embedding: [1, 2] },
      ],
    ),
  ),
  vectorStore: {
    searchSimilarResumes: vi.fn(({ chunkType }: { chunkType: string }) =>
      Promise.resolve(
        (opts.hitIds ?? ["jd-1"]).map((id) => ({
          chunkType,
          score: (opts.search ?? (() => 0.9))({ chunkType }),
          sourceId: id,
          sourceType: "job_description" as const,
        })),
      ),
    ),
  },
});

const call = (
  deps: unknown,
  over: Partial<{ jobDescriptionId: string | null; topN: number }> = {},
) =>
  recommendJobDescriptionsForResume(
    {
      organizationId: "org-1",
      resume: { id: "r-1", jobDescriptionId: over.jobDescriptionId ?? null, profile },
      topN: over.topN ?? 10,
    },
    deps as never,
  );

describe("recommendJobDescriptionsForResume", () => {
  it("加权打分 + ready", async () => {
    const scores: Record<string, number> = {
      resume_overview: 0.7,
      skill_role: 0.9,
      work_project: 0.8,
    };
    const res = await call(depsWith({ search: ({ chunkType }) => scores[chunkType] }));
    expect(res.status).toBe("ready");
    expect(res.recommendations[0]).toMatchObject({ id: "jd-1", score: 82 });
  });
  it("已绑定 → already_matched，不检索", async () => {
    const deps = depsWith({});
    const res = await call(deps, { jobDescriptionId: "jd-9" });
    expect(res.status).toBe("already_matched");
    expect(res.recommendations).toEqual([]);
    expect(deps.vectorStore.searchSimilarResumes).not.toHaveBeenCalled();
  });
  it("组织隔离：检索带 organizationId + job_description", async () => {
    const deps = depsWith({});
    await call(deps);
    expect(deps.vectorStore.searchSimilarResumes).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", sourceTypes: ["job_description"] }),
    );
  });
  it("删除兜底：向量命中但 DB 无行 → 掉出", async () => {
    const res = await call(depsWith({ hitIds: ["jd-1", "jd-gone"], displayIds: ["jd-1"] }));
    expect(res.recommendations.map((r) => r.id)).toEqual(["jd-1"]);
  });
  it("disabled", async () => {
    const res = await call(depsWith({ enabled: false }));
    expect(res.status).toBe("disabled");
  });
  it("embed 超时 → indexing", async () => {
    const deps = depsWith({ chunks: [], embed: () => Promise.reject(new Error("timeout")) });
    const res = await call(deps);
    expect(res.status).toBe("indexing");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @app/server test jd-recommendations`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 jd-recommendations.ts**：
  - `recommendJobDescriptionsForResume`：
    1. `if (!deps.enabled) return { ..., status:"disabled" }`（照抄 recommendations.ts 的 disabled 短路结构，换 result 形状）。
    2. `if (input.resume.jobDescriptionId) return { ..., status:"already_matched", recommendations:[] }`（在检索前）。
    3. 取简历向量：`const stored = await deps.loadResumeChunks({ embeddingVersion, organizationId, sourceId: resume.id, sourceType:"resume_pool_item" })`。
    4. fallback：`stored` 空 → **入队后台补索引**（`deps.enqueueResumeReindex({ organizationId, sourceId: resume.id })`，默认实现 = `enqueueResumeSemanticIndexJobBestEffort({ ..., sourceType:"resume_pool_item" })`，兑现 ADR「已排队后台补索引」）；随后若无 `profile` 直接 `status:"indexing"`；否则 `withTimeout(deps.embed({ ...embeddingConfig, chunks: buildResumeSemanticTexts(profile) }), JD_REC_EMBED_TIMEOUT_MS)`（模块内常量 `= 3000`，与 ADR 一致），超时/失败 catch → `status:"indexing"`。得到 `chunkEmbeddings: { chunkType, embedding }[]`。
    5. 对 3 个 chunk `Promise.all` 调 `deps.vectorStore.searchSimilarResumes({ chunkType, embedding, limit: SEARCH_LIMIT_BY_CHUNK[chunkType], organizationId, sourceTypes:["job_description"] })`。
    6. `mergeVectorScores(results, "job_description")`（来自共享 `scoring.ts`，sourceType 参数化）→ `weightedScore`（共享）→ `retrievedIds`。
    7. `filter(score>=55)` → 排序 `toSorted((a,b)=>b.score-a.score || a.jdId.localeCompare(b.jdId))`（分数降序，同分 JD id 升序，确定性）→ 取**全部**过阈值 id（不预截断）传 `loadJobDescriptionsForDisplay(org, ids)`（org-scoped）→ 按上面排序保留 DB 有行的 → **再** `.slice(0, topN)` → map 成 `JobDescriptionRecommendation`（`buildReasons` facet 话术、`description` 截断摘要）。**存在性过滤必须在 slice 之前**（ADR 硬约束），否则已删 JD 占位会让返回少于 topN。
    8. `indexing(b)` 判定：若 `retrievedIds.size === 0`（0 命中），查 `deps.countIndexedJdVectors(organizationId)`（默认 = `select count(*) from resume_semantic_index where org=? and sourceType='job_description' and status='indexed'`）；计数为 0 → `status:"indexing"`（本组织 JD 未回填）；计数>0 → `status:"ready"` 空结果（确实无匹配）。区分二者是 ADR 要求。
    9. return `{ diagnostics:{ filteredByThreshold, vectorHitCount: retrievedIds.size }, recommendations, resume:{ id }, status }`。
  - `SEARCH_LIMIT_BY_CHUNK`、`weightedScore`、`mergeVectorScores` **从共享 `scoring.ts` import**（本 Task Step 0 已抽取，两侧共用，不重复）。抽取时先跑 `recommendations.test.ts` 确认候选人侧无回归（它是抽取正确性的护栏）。
  - `buildReasons(similarity)`：facet 命中 → `["技能与岗位要求相似","职责/项目经验匹配","整体画像匹配"]` 中对应项（skillRole/workProject/resumeOverview 有分即加）。
  - `createDefaultJdRecommendationDeps`：`enabled = isResumeSemanticIndexEnabled() && Boolean(cfg.qdrantUrl) && Boolean(embeddingConfig.apiKey)`；`vectorStore = new QdrantResumeVectorStore({...cfg})`；`loadResumeChunks = (i)=>store.loadResumeEmbeddings(i)`；`enqueueResumeReindex = (i)=>enqueueResumeSemanticIndexJobBestEffort({ organizationId: i.organizationId, sourceId: i.sourceId, sourceType:"resume_pool_item" })`；`countIndexedJdVectors = (org)=>db.$count 查 resume_semantic_index where org + sourceType='job_description' + status='indexed'`；`loadJobDescriptionsForDisplay` 查 `jobDescription` leftJoin `department` where org + `inArray(id, ids)`。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @app/server test jd-recommendations`
Expected: PASS（全部用例）

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/server/resume-semantic/scoring.ts apps/server/src/lib/server/resume-semantic/scoring.test.ts apps/server/src/server/routes/studio/routes/job-descriptions/utils/recommendations.ts apps/server/src/server/routes/studio/routes/resume-pool/utils/jd-recommendations.ts apps/server/src/server/routes/studio/routes/resume-pool/utils/jd-recommendations.test.ts
git commit -m "feat(resume-pool): add resume->JD recommendation scoring kernel with shared scoring helpers"
```

## Task B3: 推荐端点

在 resume-pool 下加子路由 `routes/recommendations/route.ts`（CLAUDE.md 子资源约定），在 `resume-pool/route.ts` 用 `.route("/:id/recommendations", ...)` 挂载。权限**内联位置参数**。

**Files:**

- Create: `apps/server/src/server/routes/studio/routes/resume-pool/routes/recommendations/route.ts`
- Create: `.../resume-pool/routes/recommendations/schema.ts`
- Modify: `apps/server/src/server/routes/studio/routes/resume-pool/route.ts`（挂载）
- Test: `.../resume-pool/routes/recommendations/route.test.ts`（testClient）

**Interfaces:**

- Consumes: `recommendJobDescriptionsForResume`(B2), `loadResumePoolItem`（resume-pool/dao）。
- Produces: `POST /api/w/:slug/studio/resume-pool/:id/recommendations`，body `{ topN?: number }`，返回 `JobDescriptionRecommendationResult`。RPC 路径 `rpc.api.w[":slug"].studio["resume-pool"][":id"].recommendations.$post`。

- [ ] **Step 1: schema.ts**：

```ts
import { z } from "zod";
export const jdRecommendationBodySchema = z.object({
  topN: z.number().int().min(1).max(50).optional(),
});
```

- [ ] **Step 2: 写失败测试**（testClient，参照 recommendations 现有 route 测试或 resume-pool **tests**）：mock `recommendJobDescriptionsForResume` 返回桩并 spy 其入参。用例：(1) 正常→`ready` + 200，**断言内核被以 `{ organizationId: activeOrg.id, resume:{ id: item.id, jobDescriptionId: item.jobDescriptionId, profile: item.resumeProfile }, topN: 10 }` 调用**（省略 topN 时默认 10、透传 pool item 的 jobDescriptionId/profile——否则全 mock 测不出传参正确性）；(2) 显式 `topN: 5` → 内核收到 `topN: 5`；(3) item 不存在→404 且内核未被调用；(4) 端点原样透传桩的 `status`（`disabled`/`already_matched` 由内核决定，端点不重复判断）。

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @app/server test recommendations/route`
Expected: FAIL

- [ ] **Step 4: 实现 route.ts**：

```ts
import { zValidator } from "@hono/zod-validator";
import { requirePermission } from "@app/server/server/middlewares/permission";
import { jsonValidatorError } from "@app/server/server/...";
import { loadResumePoolItem } from "../../dao";
import { recommendJobDescriptionsForResume } from "../../utils/jd-recommendations";
import { jdRecommendationBodySchema } from "./schema";
// factory 用与 resume-pool/route.ts 同源的 createApp/factory

export const resumePoolRecommendationsRouter = factory
  .createApp()
  .post(
    "/",
    requirePermission("resumePool", "read"),
    requirePermission("jd", "read"),
    zValidator("json", jdRecommendationBodySchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const activeOrg = c.var.activeOrg; // 依现有中间件取法
      const user = c.var.user;
      const item = await loadResumePoolItem({
        organizationId: activeOrg.id,
        poolItemId: c.req.param("id"),
        userId: user.id,
      });
      if (!item) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      const { topN } = c.req.valid("json");
      const result = await recommendJobDescriptionsForResume({
        organizationId: activeOrg.id,
        resume: {
          id: item.id,
          jobDescriptionId: item.jobDescriptionId,
          profile: item.resumeProfile ?? null,
        },
        topN: topN ?? 10,
      });
      return c.json(result, 200);
    },
  );
```

（`activeOrg`/`user` 取法、`factory`、`jsonValidatorError` 导入路径以 `resume-pool/route.ts` 现有写法为准，逐一对齐。`item.resumeProfile` 字段名以 `loadResumePoolItem` 返回类型为准。）

- [ ] **Step 5: 挂载** — `resume-pool/route.ts` 尾部链上：

```ts
.route("/:id/recommendations", resumePoolRecommendationsRouter)
```

（import 置顶。确认 `.route` 挂在 `resumePoolRouter` 链内，路径 `/:id/recommendations` 与现有 `/:id/import` 等平级。）

- [ ] **Step 6: 跑测试确认通过 + typecheck（RPC 类型应自动出现）**

Run: `pnpm --filter @app/server test recommendations/route && pnpm --filter @app/server typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/server/routes/studio/routes/resume-pool/routes/recommendations apps/server/src/server/routes/studio/routes/resume-pool/route.ts
git commit -m "feat(resume-pool): add POST /:id/recommendations endpoint"
```

## Task B4: 前端「推荐岗位」面板

镜像 `job-description-talent-recommendations-dialog.tsx` 的 `useQuery` + `rpcFetch` + `rpc` 模式，做成简历详情页面板。

**Files:**

- Create: `apps/web/src/components/features/studio/resume-pool/resume-pool-recommendations-panel.tsx`
- Test: `resume-pool-recommendations-panel.test.tsx`（最小状态测试，非可选）——面板有多个状态分支，mock `rpcFetch` 分别返回 `disabled` / `indexing` / `ready`(有卡片) / `ready`(空+diagnostics) / 已绑定(bound=true)，断言各自渲染对应文案/卡片/`null`（不渲染）。

**Interfaces:**

- Consumes: `JobDescriptionRecommendationResult`(B1), RPC 路径(B3)。
- Produces: `export function ResumePoolRecommendationsPanel({ detail, slug }: { detail: ResumePoolDetail; slug: string })`。

- [ ] **Step 1: 实现面板** — 骨架：

```tsx
import { useQuery } from "@tanstack/react-query";
import type { JobDescriptionRecommendationResult } from "@arc/shared/job-descriptions";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

export function ResumePoolRecommendationsPanel({
  detail,
  slug,
}: {
  detail: ResumePoolDetail;
  slug: string;
}) {
  const bound = Boolean(detail.jobDescriptionId);
  const query = useQuery({
    enabled: !bound, // 已绑定不请求（决策 5）
    queryFn: (): Promise<JobDescriptionRecommendationResult> =>
      rpcFetch<JobDescriptionRecommendationResult>(
        rpc.api.w[":slug"].studio["resume-pool"][":id"].recommendations.$post({
          json: { topN: 10 },
          param: { id: detail.id, slug },
        }),
        "加载岗位推荐失败",
      ),
    queryKey: ["resume-pool", "jd-recommendations", slug, detail.id] as const,
    staleTime: 60 * 1000,
  });
  if (bound) {
    return null;
  }
  // 渲染分支：isLoading → skeleton；status "disabled" → 灰态「语义索引未启用」；
  // "indexing" → 「岗位/简历索引处理中，稍后重试」；"ready" 且空 → 依 diagnostics 区分
  // 「暂无合适岗位」/「暂无命中」；否则渲染 Top-N 卡片（name/departmentName/score/reasons）+
  // 每卡「匹配到此岗位」按钮（B5 接绑定）。
}
```

- [ ] **Step 2: 写状态测试** — `resume-pool-recommendations-panel.test.tsx`（React Testing Library + Vitest，mock `rpcFetch`）：分别断言 `disabled`→灰态文案、`indexing`→"处理中"文案、`ready`(有卡)→渲染 JD 名+分数+理由、`ready`(空+diagnostics)→"暂无合适岗位"/"暂无命中"、`bound=true`→组件返回 `null`（不渲染）。先写、跑 → 红。

Run: `pnpm --filter @app/web test resume-pool-recommendations-panel`
Expected: FAIL → 补齐面板渲染分支后 PASS

- [ ] **Step 3: lint/typecheck**

Run: `pnpm --filter @app/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/features/studio/resume-pool/resume-pool-recommendations-panel.tsx apps/web/src/components/features/studio/resume-pool/resume-pool-recommendations-panel.test.tsx
git commit -m "feat(resume-pool): add JD recommendations panel component"
```

## Task B5: 绑定端点（后端，选项 A）

新增 `POST /:id/bind`：仅回填 `resumePoolItem.jobDescriptionId`，与 import（入库开筛）解耦。放在 resume-pool 子路由或直接内联进 `resume-pool/route.ts`（与现有 `.post("/:id/publish", ...)` 平级，风格一致，故内联）。

**Files:**

- Modify: `apps/server/src/server/routes/studio/routes/resume-pool/route.ts`（加 `.post("/:id/bind", ...)`）
- Modify: `apps/server/src/server/routes/studio/routes/resume-pool/dao.ts`（加 `bindResumePoolItemJobDescription`）
- Modify: `.../resume-pool/schema.ts`（加 `resumePoolBindSchema`）
- Test: `.../resume-pool/__tests__/bind.test.ts`（testClient）

**Interfaces:**

- Produces: `POST /api/w/:slug/studio/resume-pool/:id/bind`，body `{ jobDescriptionId: string }`，成功返回更新后的 pool item（含 `jobDescriptionId`）。DAO `bindResumePoolItemJobDescription({ organizationId, poolItemId, jobDescriptionId, actorId }): Promise<boolean>`（**条件更新** `WHERE id=? AND organizationId=? AND jobDescriptionId IS NULL`，返回是否命中一行；命中才写 `writeResumePoolEvent(type:"bound")`。落实决策 5「已绑定不重推/不换绑」于服务端，并兜底并发双写——先写者赢，后写者 0 命中）。

- [ ] **Step 1: schema.ts** — 加：

```ts
export const resumePoolBindSchema = z.object({
  jobDescriptionId: z.string().trim().min(1),
});
```

- [ ] **Step 2: 写失败测试**（testClient）：绑定不存在 JD → 400；绑定他组织 JD → 400；成功 → 200 且返回 item.jobDescriptionId===目标；item 不存在 → 404；**已绑定的 pool item 再次 bind → 409**（条件更新 0 命中，落实 bind-once）。

Run: `pnpm --filter @app/server test resume-pool`（新用例）
Expected: FAIL

- [ ] **Step 3: DAO** — `dao.ts` 加 `bindResumePoolItemJobDescription`：`db.transaction` 内 `update(resumePoolItem).set({ jobDescriptionId, updatedAt }).where(and(eq(id), eq(organizationId), isNull(resumePoolItem.jobDescriptionId)))` → 用返回的 `rowCount`/结果长度判断是否命中；命中才 `writeResumePoolEvent(tx, { type: "bound", ... })` 并返回 `true`，否则返回 `false`（已绑定）。事件类型：`resumePoolEvent.type` 列是 `text().$type<ResumePoolEventType>()`（**TS 联合类型、非 pg enum，故无需 DB 迁移**）。在 `@arc/db-schema` 里 `ResumePoolEventType` 联合类型补 `"bound"`（纯类型改动），DAO 用 `type:"bound"`。若该联合有对应 Zod schema 也一并加。

- [ ] **Step 4: route.ts** — 加（校验 JD 属组织的逻辑照抄 import handler `route.ts:310-323`）：

```ts
.post(
  "/:id/bind",
  requirePermission("resumePool", "import"),
  requirePermission("jd", "read"),
  zValidator("json", resumePoolBindSchema, jsonValidatorError("请求参数无效。")),
  async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const { jobDescriptionId } = c.req.valid("json");
    const item = await loadResumePoolItem({ organizationId: activeOrg.id, poolItemId: c.req.param("id"), userId: user.id });
    if (!item) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const [jd] = await db
      .select({ id: jobDescription.id })
      .from(jobDescription)
      .where(and(eq(jobDescription.id, jobDescriptionId), eq(jobDescription.organizationId, activeOrg.id)))
      .limit(1);
    if (!jd) {
      return c.json({ error: "所选在招岗位不存在。" }, 400);
    }
    const bound = await bindResumePoolItemJobDescription({ actorId: user.id, jobDescriptionId, organizationId: activeOrg.id, poolItemId: item.id });
    if (!bound) {
      return c.json({ error: "该简历已绑定岗位。" }, 409);
    }
    const updated = await loadResumePoolItem({ organizationId: activeOrg.id, poolItemId: item.id, userId: user.id });
    return c.json(updated, 200);
  },
)
```

- [ ] **Step 5: 跑测试确认通过 + typecheck**

Run: `pnpm --filter @app/server test resume-pool && pnpm --filter @app/server typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/server/routes/studio/routes/resume-pool/route.ts apps/server/src/server/routes/studio/routes/resume-pool/dao.ts apps/server/src/server/routes/studio/routes/resume-pool/schema.ts apps/server/src/server/routes/studio/routes/resume-pool/__tests__/bind.test.ts
git commit -m "feat(resume-pool): add POST /:id/bind to set pool item job description"
```

## Task B6: 详情页嵌入 + 一键绑定 + 失效

**Files:**

- Modify: `apps/web/src/lib/client/api/endpoints/resume-pool.ts`（加 `bindResumePoolItem`，`rpcFetch` + `rpc` 调 B5 端点）
- Modify: `apps/web/src/components/features/studio/resume-pool/resume-pool-recommendations-panel.tsx`（绑定 mutation 在面板内「匹配到此岗位」按钮上，pending 禁用、error toast）
- Modify: `apps/web/src/components/features/studio/resume-pool/resume-pool-details.tsx`（嵌面板，~line 360-377 两个 panel 之间；把 `queryClient` 失效回调传给面板）

**Interfaces:**

- Consumes: `ResumePoolRecommendationsPanel`(B4), B5 端点。

- [ ] **Step 1: 前端端点助手** — `endpoints/resume-pool.ts` 加（镜像 `fetchResumePoolItem`）：

```ts
export function bindResumePoolItem(
  slug: string,
  id: string,
  jobDescriptionId: string,
): Promise<ResumePoolDetail> {
  return rpcFetch<ResumePoolDetail>(
    rpc.api.w[":slug"].studio["resume-pool"][":id"].bind.$post({
      json: { jobDescriptionId },
      param: { id, slug },
    }),
    "绑定岗位失败",
  );
}
```

- [ ] **Step 2: 嵌入面板** — 在 `<ResumePoolDetailSummaryPanel .../>` 与 `<ResumePoolStructuredInfoPanel .../>` 之间插 `<ResumePoolRecommendationsPanel detail={detail} slug={slug} />`（import 置顶）。

- [ ] **Step 3: 绑定 mutation**（面板内「匹配到此岗位」按钮）——`useMutation` 调 `bindResumePoolItem(slug, detail.id, jd.id)`；`isPending` 时禁用该卡按钮（防重复点击 / 防换绑）；`onError`：若 `ApiError.status===409`（他人已绑定）→ toast「该简历已绑定岗位」**并失效详情 query**（拉到最新 jobDescriptionId，面板据 `enabled:!bound` 自动收起，避免用户以为还能绑），其他错误 → toast「绑定失败」；`onSuccess` 失效：

```ts
void queryClient.invalidateQueries({ queryKey: ["resume-pool", "detail", slug, detail.id] });
void queryClient.invalidateQueries({ queryKey: ["resume-pool", slug] });
```

（绑定成功后详情刷新、`detail.jobDescriptionId` 变非空，面板 `enabled:!bound` 自动收起。服务端 B5 用条件更新兜底并发换绑，前端禁用只是体验层。）

- [ ] **Step 4: 跑前端测试 + typecheck**

Run: `pnpm --filter @app/web test && pnpm --filter @app/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/client/api/endpoints/resume-pool.ts apps/web/src/components/features/studio/resume-pool/resume-pool-recommendations-panel.tsx apps/web/src/components/features/studio/resume-pool/resume-pool-details.tsx
git commit -m "feat(resume-pool): embed JD recommendations panel with one-click bind"
```

**Phase B 验收**：未绑定简历详情页出现「推荐岗位」面板，展示 Top-N JD（分数 + 理由 + 部门）；点「匹配到此岗位」经 `POST /:id/bind` 回填 `resumePoolItem.jobDescriptionId`、面板收起、详情刷新；已绑定简历不显示面板；语义索引未启用时灰态。

---

# 集成冒烟验收（手动，单测/typecheck 之外）

单测与 typecheck 是 CI 门，但无法证明"JD 建改删后真进 worker 并能被推荐端点召回"。上线前跑一次端到端冒烟（需真 Qdrant + embedding + Redis + worker + DB）：

- [ ] 前置：`.env` 配好 `RESUME_SEMANTIC_INDEX_ENABLED=1` + `QDRANT_URL` + embedding key + `DATABASE_URL` + Redis；启动 worker（`@app/worker`）。
- [ ] **索引链路**：建一个 JD → 看 worker 日志出现 `job_description` 索引成功；Qdrant 查该 collection 有 `sourceType=job_description` 的点（`scroll` filter sourceType）。改 JD 的 description → 重新索引（hash 变）；改无关字段（不影响 hash 的）→ 跳过。删 JD → 点被删。
- [ ] **回填**：对已有 JD 跑 `pnpm --filter @app/server backfill:jd-semantic`，日志 `backfill_finished`，Qdrant 出现存量 JD 点。
- [ ] **召回链路**：取一份已索引、未绑定的 pool item → `POST /:id/recommendations` → 返回 `ready` + Top-N JD；删掉其中一个 Top JD → 再次调用该 JD 掉出（存在性兜底）；对刚导入未索引的 pool item → 返回 `indexing` 且后台补索引任务入队。
- [ ] **绑定链路**：`POST /:id/bind` → 回填成功、再次 bind 同一 item → 409；详情页面板绑定后收起。
- [ ] 收尾：全仓 `pnpm fix` + `pnpm check`（Global Constraints 的 lint/format 门，集中在此跑一次避免延后暴露）。

---

## Self-Review 记录

- **ADR 覆盖**：决策 1（JD 进向量库）→A1–A5；决策 2（旁路/worker 分流）→A4/A5/A7；决策 3（详情页入口）→B4/B6；决策 4（一键回填 `resumePoolItem.jobDescriptionId`）→**B5 新增 `POST /:id/bind` + B6 前端**（选项 A）；决策 5（已绑定不展示）→B4 `enabled:!bound`（gate 读 pool item 自身 jobDescriptionId，与 B5 回填目标一致）。数据流索引时→A5/A8；查询时→B2。组件清单队列/schema→A4/A7；后端 lib→A3/A5/A6；route→A8/B3/B5；打分内核→B2；Shared DTO→B1；前端→B4/B6；存量回填→A9。边界与失效（disabled/indexing/删除兜底/可观测性/回退补索引）→B2 用例 + A6 日志。测试三类→A5/B2/B3/B5。
- **偏离 ADR 处（已在正文标注）**：(1) 无需新建 JD vector store 类，直接复用 `QdrantResumeVectorStore`；(2) hash 增加 `departmentName`（回写 ADR）；(3) **绑定=选项 A 新增 `POST /:id/bind`**（ADR 决策 4 误以为 `jobDescriptionMode:"bind"` 回填 pool item，实为 import 入库；已核实并回写 ADR）；(4) 权限内联而非 `.use()`；(5) `perChunkLimit` 落地为现有 `SEARCH_LIMIT_BY_CHUNK` 常量、检索参数名为 `limit`（回写 ADR）；(6) `markSemanticIndex*` 未导出，改用 `upsertResumeSemanticIndexState`；(7) 打分工具（`SEARCH_LIMIT_BY_CHUNK`/`mergeVectorScores`/`weightedScore`）**抽到共享 `resume-semantic/scoring.ts`**、两侧 import（用户定夺：抽共享 helper 而非复制），B2 Step 0 完成抽取。
- **类型一致性**：`sourceType:"job_description"` 贯穿 A1/A4/A5/A6/A7；`JobDescriptionRecommendationResult` 由 B1 定义、B2/B3/B4 消费；`JobDescriptionSemanticInput` 由 A2 定义、A3/A5 消费。
