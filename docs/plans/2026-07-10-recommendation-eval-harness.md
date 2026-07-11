# 岗位人才推荐 评测集与基线度量 Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建只读的分组 leave-one-out 召回评测器，从历史漏斗信号挖标签，跑出岗位人才推荐当前召回基线（recall@20/50、MRR + 五类失败拆分）。

**Architecture:** 先给现有推荐函数补特征化测试并抽出"打分内核"（返回完整排序 + 诊断中间量，**不含 ensureCollection**），生产包装器行为不变；再在 `src/scripts/reco-eval/` 下建纯函数为主的评测模块（挖标签 → 校验去重 → 五类判定 → 聚合 → 报告），CLI 入口一次性连生产库/Qdrant 产报告。

**Tech Stack:** TypeScript, Vitest, Drizzle(postgres), Qdrant JS client, DashScope embedding；经 `tsx` 运行。

## Global Constraints

- **只读**：评测**不写 DB、不写 Qdrant**。打分内核**不调用 `ensureCollection()`**；CLI 运行前**断言 collection 存在**（缺失即非零退出，绝不创建）。
- **`candidateId` ≡ `studio_interview.id`**（= Qdrant `sourceId`，sourceType=`studio_interview`；= `loadRecommendationCandidates` 主键）。
- **命中定义**：`score ≥ 55` 且 `shownRank ≤ 20`。生产召回上限 40/50/50，阈值 55，topK 20。
- **破平只在评测路径**：生产 `toSorted` 稳定排序不改；评测同分按 `candidateId` **码点序**（`a<b?-1:a>b?1:0`，非 localeCompare）升序破平。
- **五类互斥、按管线顺序**：not_indexed → recall_capped → status_filtered → below_threshold → retrieved_low_rank。
- **本轮交付 = B-only 基线 + a-plus-b 读文件接口**；A 补强工具（选岗导出/回收）另开小计划。
- **组织**：`org_default`。
- 规范文档：`docs/adr/2026-07-10-recommendation-eval-harness-design.md`。

---

## 共享类型（`src/scripts/reco-eval/types.ts`；各任务按此签名，勿改名）

```ts
export type LabelSource = "mined" | "manual";
export interface PositiveLabel {
  jobDescriptionId: string;
  candidateId: string; // = studio_interview.id
  label: "positive";
  source: LabelSource;
}
export interface FacetSimilarity {
  resumeOverview?: number;
  skillRole?: number;
  workProject?: number;
}
export type FailureClass =
  | "not_indexed"
  | "recall_capped"
  | "status_filtered"
  | "below_threshold"
  | "retrieved_low_rank";
export type HitOrClass = "hit" | FailureClass;
export interface PositiveVerdict {
  jobDescriptionId: string;
  candidateId: string;
  klass: HitOrClass;
  rawRank: number | null; // 完整排序 1-based 名次；不在列表为 null
  shownRank: number | null; // score>=55 子列表名次；不适用为 null
  score: number | null;
}
```

> `ScoreCoreResult`（打分内核返回，含完整候选记录供生产 DTO）定义在 `recommendations.ts`（Task 2），评测侧用结构化最小类型消费（Task 4）。

---

### Task 1: 现有推荐函数的特征化测试

锁死重构前的生产行为：阈值过滤、limit 截断、稳定同分序、`excludeAlreadyLinked` 两种取值。

**Files:**

- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/recommendations.test.ts`（追加）

**Interfaces:**

- Consumes: `recommendCandidatesForJobDescription(input, deps)`（`deps: RecommendationDeps`）。

- [ ] **Step 1: 落地前先 Read 确认 fixture 字段**

Read `recommendations.ts:324-368`（`loadRecommendationCandidates` 的 select 列），确保下面 fixture 的候选记录字段名与之一致（`id/candidateName/currentJobDescriptionId/resumeParseStatus/resumeProfile/skillsNormalized` 等）。有出入以真实为准。

- [ ] **Step 2: 写特征化测试**

追加到文件（复用顶部 `candidateProfile`）：

```ts
const rec = (id: string, currentJd: string | null = null) => ({
  id,
  candidateName: id,
  candidateEmail: null,
  candidatePhone: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  currentJobDescriptionId: currentJd,
  currentJobDescriptionName: null,
  notes: null,
  resumeFileName: null,
  resumeParseStatus: "ready" as const,
  resumeProfile: candidateProfile,
  skillsNormalized: [],
  targetRole: null,
});
const depsWith = (
  search: (a: { chunkType: string }) => number,
  candidates: ReturnType<typeof rec>[],
) => ({
  embed: vi.fn(({ chunks }: { chunks: { chunkType: string; text: string }[] }) =>
    Promise.resolve(chunks.map((c) => ({ ...c, embedding: [1, 2] }))),
  ),
  embeddingConfig: { apiKey: "k", baseUrl: "b", dimensions: 2, model: "m" },
  enabled: true,
  vectorStore: {
    ensureCollection: vi.fn(() => Promise.resolve()),
    searchSimilarResumes: vi.fn(({ chunkType }: { chunkType: string }) =>
      Promise.resolve(
        candidates.map((c) => ({
          chunkType,
          score: search({ chunkType }),
          sourceId: c.id,
          sourceType: "studio_interview" as const,
        })),
      ),
    ),
  },
  loadCandidates: vi.fn(() => Promise.resolve(candidates)),
});
const jd = { id: "jd1", name: "后端", description: "d", prompt: "p", departmentName: null };
const call = (deps: ReturnType<typeof depsWith>, excludeAlreadyLinked = true, limit = 20) =>
  recommendCandidatesForJobDescription(
    { excludeAlreadyLinked, jobDescription: jd, limit, organizationId: "org" },
    deps,
  );

describe("recommendCandidatesForJobDescription — 特征化(锁生产行为)", () => {
  it("score<55 被阈值剔除", async () => {
    const res = await call(depsWith(() => 0.2, [rec("low")])); // 加权≈9
    expect(res.candidates).toHaveLength(0);
  });
  it("limit 截断：两高分 limit=1 只返回第一", async () => {
    const res = await call(
      depsWith(({ chunkType }) => (chunkType === "skill_role" ? 0.95 : 0.9), [rec("a"), rec("b")]),
      true,
      1,
    );
    expect(res.candidates).toHaveLength(1);
  });
  it("同分保留输入(loadCandidates)顺序", async () => {
    const res = await call(
      depsWith(({ chunkType }) => (chunkType === "skill_role" ? 0.9 : 0.9), [rec("a"), rec("b")]),
    );
    expect(res.candidates.map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("excludeAlreadyLinked=true 剔除已绑定本 JD", async () => {
    const res = await call(
      depsWith(
        ({ chunkType }) => (chunkType === "skill_role" ? 0.95 : 0.9),
        [rec("linked", "jd1")],
      ),
    );
    expect(res.candidates.map((c) => c.id)).not.toContain("linked");
  });
  it("excludeAlreadyLinked=false 保留已绑定本 JD", async () => {
    const res = await call(
      depsWith(
        ({ chunkType }) => (chunkType === "skill_role" ? 0.95 : 0.9),
        [rec("linked", "jd1")],
      ),
      false,
    );
    expect(res.candidates.map((c) => c.id)).toContain("linked");
  });
});
```

- [ ] **Step 3: 跑测试确认全绿（锁现状）**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test recommendations`
Expected: 全绿。若某条不符现状 → 说明我对生产行为的理解有误，**先纠正测试到反映现状**（不是改生产）。

- [ ] **Step 4: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/recommendations.test.ts
git commit -m "test(recommendations): 补特征化测试锁生产行为(阈值/limit/稳定序/绑定过滤)"
```

---

### Task 2: 抽出打分内核（不含 ensureCollection）

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/recommendations.ts`
- Test: 同目录 `recommendations.test.ts`

**Interfaces (Produces):**

```ts
export interface FacetSimilarity {
  resumeOverview?: number;
  skillRole?: number;
  workProject?: number;
}
export interface CoreRankedEntry {
  candidate: RecommendationCandidateRecord; // 完整记录，供生产 DTO
  candidateId: string;
  score: number;
  similarity: FacetSimilarity;
}
export interface ScoreCoreResult {
  ranked: CoreRankedEntry[];
  retrievedIds: Set<string>;
  loadedIds: Set<string>;
}
export interface ScoreCoreInput {
  excludeLinkedExceptIds?: Set<string>; // 排除绑定 J 的候选，但豁免这些 id；不传=不因绑定排除
  jobDescription: RecommendJobDescription;
  organizationId: string;
}
export function scoreCandidatesForJobDescription(
  input: ScoreCoreInput,
  deps?: RecommendationDeps,
): Promise<ScoreCoreResult>;
export function createDefaultRecommendationDeps(): RecommendationDeps; // 加 export（供评测注入 store）
```

- [ ] **Step 1: 写内核单测（先失败）**

```ts
import { scoreCandidatesForJobDescription } from "./recommendations";

it("内核返回完整排序 + 诊断中间量(不套阈值/截断，不调 ensureCollection)", async () => {
  const ensureCollection = vi.fn(() => Promise.resolve());
  const deps = {
    ...depsWith(() => 0.2, [rec("low")]),
    vectorStore: {
      ensureCollection,
      searchSimilarResumes: vi.fn(({ chunkType }: { chunkType: string }) =>
        Promise.resolve([
          { chunkType, score: 0.2, sourceId: "low", sourceType: "studio_interview" as const },
        ]),
      ),
    },
  };
  const core = await scoreCandidatesForJobDescription(
    { jobDescription: jd, organizationId: "org" },
    deps,
  );
  expect(core.ranked).toHaveLength(1); // 低分未被 55 剔除
  expect(core.ranked[0].candidateId).toBe("low");
  expect(core.retrievedIds.has("low")).toBe(true);
  expect(core.loadedIds.has("low")).toBe(true);
  expect(ensureCollection).not.toHaveBeenCalled(); // 内核不调 ensureCollection
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test recommendations`
Expected: FAIL — `scoreCandidatesForJobDescription is not a function`。

- [ ] **Step 3: 实现内核 + 生产函数复用它**

在 `recommendations.ts`：加上文类型；实现内核（**无 ensureCollection**）；`createDefaultRecommendationDeps` 加 `export`。

```ts
export async function scoreCandidatesForJobDescription(
  input: ScoreCoreInput,
  deps: RecommendationDeps = createDefaultRecommendationDeps(),
): Promise<ScoreCoreResult> {
  const chunks = buildJobRecommendationQueryTexts(input.jobDescription);
  const embedded = await deps.embed({ ...deps.embeddingConfig, chunks });
  const resultGroups = await Promise.all(
    embedded.map((chunk) =>
      deps.vectorStore.searchSimilarResumes({
        chunkType: chunk.chunkType,
        embedding: chunk.embedding,
        limit: SEARCH_LIMIT_BY_CHUNK[chunk.chunkType],
        organizationId: input.organizationId,
        sourceTypes: ["studio_interview"],
      }),
    ),
  );
  const bySource = mergeVectorScores(resultGroups.flat());
  const retrievedIds = new Set(bySource.keys());
  const candidates = await deps.loadCandidates(input.organizationId, [...bySource.keys()]);
  const loadedIds = new Set(candidates.map((c) => c.id));
  const exempt = input.excludeLinkedExceptIds;
  const ranked = candidates
    .filter(
      (c) =>
        !(exempt && c.currentJobDescriptionId === input.jobDescription.id && !exempt.has(c.id)),
    )
    .flatMap((c) => {
      const s = bySource.get(c.id);
      return s ? [{ candidate: c, candidateId: c.id, score: weightedScore(s), similarity: s }] : [];
    })
    .toSorted((a, b) => b.score - a.score);
  return { loadedIds, ranked, retrievedIds };
}
```

改造生产函数（`ensureCollection` 留在此处，行为不变）：

```ts
export async function recommendCandidatesForJobDescription(
  input,
  deps = createDefaultRecommendationDeps(),
) {
  if (!deps.enabled) {
    return {
      candidates: [],
      diagnostics: { vectorHitCount: 0 },
      jobDescription: { id: input.jobDescription.id, name: input.jobDescription.name },
      status: "disabled",
    };
  }
  await deps.vectorStore.ensureCollection();
  const core = await scoreCandidatesForJobDescription(
    {
      excludeLinkedExceptIds: input.excludeAlreadyLinked ? new Set<string>() : undefined,
      jobDescription: input.jobDescription,
      organizationId: input.organizationId,
    },
    deps,
  );
  const jdText = [
    input.jobDescription.name,
    input.jobDescription.description,
    input.jobDescription.prompt,
  ]
    .filter((v): v is string => typeof v === "string")
    .join("\n");
  const candidates = core.ranked
    .filter((r) => r.score >= 55)
    .slice(0, input.limit)
    .map((r) => toRecommendation(r.candidate, r.similarity, jdText));
  return {
    candidates,
    diagnostics: { vectorHitCount: core.retrievedIds.size },
    jobDescription: { id: input.jobDescription.id, name: input.jobDescription.name },
    status: "ready",
  };
}
```

> `RecommendationCandidateRecord` 已在本文件定义，直接引用。`toRecommendation(candidate, similarity, jdText)` 内部 `weightedScore(similarity)` 复算的 score 与 core 一致。

- [ ] **Step 4: 跑测试确认全绿（内核新测 + Task 1 特征化都过）**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test recommendations`
Expected: PASS（特征化仍绿 = 生产行为未变）。

- [ ] **Step 5: typecheck**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/recommendations.ts apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/recommendations.test.ts
git commit -m "refactor(recommendations): 抽打分内核(不含ensureCollection,行为不变)"
```

---

### Task 3: 标签去重 + 有效性校验（纯函数）

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/types.ts`（上文共享类型）
- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/labels.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/labels.test.ts`

**Interfaces (Produces):**

```ts
export interface DedupResult {
  labels: PositiveLabel[];
  conflicts: number;
}
export function dedupeLabels(raw: PositiveLabel[]): DedupResult; // 键(jd,cand)，冲突 manual 优先
export function validateLabels(
  labels: PositiveLabel[],
  validKeys: Set<string>,
): { valid: PositiveLabel[]; invalid: number };
export function labelKey(l: { jobDescriptionId: string; candidateId: string }): string; // `${jd}::${cand}`
```

- `validKeys` = DB 侧算出的"存在+绑定该 jd+属该 org+parseStatus=ready"的 `labelKey` 集合（DB 拉取在 Task 6/7 glue）。

- [ ] **Step 1: 写测试（先失败）**

```ts
import { describe, expect, it } from "vitest";
import { dedupeLabels, labelKey, validateLabels } from "./labels";
import type { PositiveLabel } from "./types";
const L = (jd: string, c: string, source: "mined" | "manual" = "mined"): PositiveLabel => ({
  candidateId: c,
  jobDescriptionId: jd,
  label: "positive",
  source,
});

describe("labels", () => {
  it("dedupe：manual 优先并计冲突", () => {
    const r = dedupeLabels([L("j", "c1", "mined"), L("j", "c1", "manual"), L("j", "c2")]);
    expect(r.labels).toHaveLength(2);
    expect(r.labels.find((l) => l.candidateId === "c1")?.source).toBe("manual");
    expect(r.conflicts).toBe(1);
  });
  it("validate：不在 validKeys 的被剔除并计数", () => {
    const r = validateLabels(
      [L("j", "c1"), L("j", "cX")],
      new Set([labelKey({ candidateId: "c1", jobDescriptionId: "j" })]),
    );
    expect(r.valid.map((l) => l.candidateId)).toEqual(["c1"]);
    expect(r.invalid).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/labels`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
import type { PositiveLabel } from "./types";
export function labelKey(l: { jobDescriptionId: string; candidateId: string }): string {
  return `${l.jobDescriptionId}::${l.candidateId}`;
}
export interface DedupResult {
  labels: PositiveLabel[];
  conflicts: number;
}
export function dedupeLabels(raw: PositiveLabel[]): DedupResult {
  const map = new Map<string, PositiveLabel>();
  let conflicts = 0;
  for (const r of raw) {
    const k = labelKey(r);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, r);
      continue;
    }
    conflicts += 1;
    if (cur.source === "mined" && r.source === "manual") map.set(k, r);
  }
  return { conflicts, labels: [...map.values()] };
}
export function validateLabels(labels: PositiveLabel[], validKeys: Set<string>) {
  const valid = labels.filter((l) => validKeys.has(labelKey(l)));
  return { invalid: labels.length - valid.length, valid };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/labels`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/types.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/labels.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/labels.test.ts
git commit -m "feat(reco-eval): 标签去重(manual优先)+有效性校验"
```

---

### Task 4: 五类判定器（纯函数，核心）

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/classify.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/classify.test.ts`

**Interfaces (Produces):**

```ts
export const THRESHOLD = 55;
export const TOP_K = 20;
export interface ClassifyCore {
  // 结构化最小类型，兼容 Task 2 的 ScoreCoreResult
  ranked: { candidateId: string; score: number }[];
  retrievedIds: Set<string>;
  loadedIds: Set<string>;
}
export interface ClassifyInput {
  candidateId: string;
  jobDescriptionId: string;
  core: ClassifyCore;
  hasAnyVector: boolean;
}
export function classifyPositive(input: ClassifyInput): PositiveVerdict;
```

优先级：not_indexed → recall_capped → status_filtered → below_threshold → retrieved_low_rank → hit。

- [ ] **Step 1: 写测试（先失败）**

```ts
import { describe, expect, it } from "vitest";
import { classifyPositive } from "./classify";
const core = (
  ranked: { candidateId: string; score: number }[],
  retrieved: string[],
  loaded: string[],
) => ({ loadedIds: new Set(loaded), ranked, retrievedIds: new Set(retrieved) });
const inp = (over: Partial<Parameters<typeof classifyPositive>[0]>) => ({
  candidateId: "p",
  hasAnyVector: true,
  jobDescriptionId: "j",
  core: core([], [], []),
  ...over,
});

describe("classifyPositive", () => {
  it("无向量→not_indexed", () =>
    expect(classifyPositive(inp({ hasAnyVector: false })).klass).toBe("not_indexed"));
  it("有向量未检索→recall_capped", () =>
    expect(classifyPositive(inp({})).klass).toBe("recall_capped"));
  it("检索到但被过滤→status_filtered", () =>
    expect(classifyPositive(inp({ core: core([], ["p"], []) })).klass).toBe("status_filtered"));
  it("score<55→below_threshold", () => {
    const v = classifyPositive(
      inp({ core: core([{ candidateId: "p", score: 40 }], ["p"], ["p"]) }),
    );
    expect(v.klass).toBe("below_threshold");
    expect(v.score).toBe(40);
  });
  it("score>=55 但 shownRank>20→retrieved_low_rank", () => {
    const ranked = Array.from({ length: 25 }, (_, i) => ({ candidateId: `c${i}`, score: 90 - i }));
    ranked.push({ candidateId: "p", score: 60 });
    const ids = ranked.map((r) => r.candidateId);
    const v = classifyPositive(inp({ core: core(ranked, ids, ids) }));
    expect(v.klass).toBe("retrieved_low_rank");
    expect(v.shownRank).toBe(26);
  });
  it("score>=55 且 shownRank<=20→hit", () => {
    const v = classifyPositive(
      inp({ core: core([{ candidateId: "p", score: 80 }], ["p"], ["p"]) }),
    );
    expect(v.klass).toBe("hit");
    expect(v.rawRank).toBe(1);
  });
  it("同分按 candidateId 码点序破平", () => {
    const v = classifyPositive(
      inp({
        candidateId: "b",
        core: core(
          [
            { candidateId: "a", score: 80 },
            { candidateId: "b", score: 80 },
          ],
          ["a", "b"],
          ["a", "b"],
        ),
      }),
    );
    expect(v.rawRank).toBe(2);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/classify`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
import type { PositiveVerdict } from "./types";
export const THRESHOLD = 55;
export const TOP_K = 20;
export interface ClassifyCore {
  ranked: { candidateId: string; score: number }[];
  retrievedIds: Set<string>;
  loadedIds: Set<string>;
}
export interface ClassifyInput {
  candidateId: string;
  jobDescriptionId: string;
  core: ClassifyCore;
  hasAnyVector: boolean;
}

function stableRanked(core: ClassifyCore) {
  return [...core.ranked].sort(
    (a, b) =>
      b.score - a.score ||
      (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0),
  );
}
export function classifyPositive(i: ClassifyInput): PositiveVerdict {
  const base = {
    candidateId: i.candidateId,
    jobDescriptionId: i.jobDescriptionId,
    rawRank: null,
    score: null,
    shownRank: null,
  };
  if (!i.hasAnyVector) return { ...base, klass: "not_indexed" };
  if (!i.core.retrievedIds.has(i.candidateId)) return { ...base, klass: "recall_capped" };
  if (!i.core.loadedIds.has(i.candidateId)) return { ...base, klass: "status_filtered" };
  const ranked = stableRanked(i.core);
  const rawRank = ranked.findIndex((c) => c.candidateId === i.candidateId) + 1;
  const score = ranked[rawRank - 1].score;
  if (score < THRESHOLD) return { ...base, klass: "below_threshold", rawRank, score };
  const shownRank =
    ranked.filter((c) => c.score >= THRESHOLD).findIndex((c) => c.candidateId === i.candidateId) +
    1;
  if (shownRank > TOP_K) return { ...base, klass: "retrieved_low_rank", rawRank, score, shownRank };
  return { ...base, klass: "hit", rawRank, score, shownRank };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/classify`
Expected: PASS（7 例）。

- [ ] **Step 5: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/classify.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/classify.test.ts
git commit -m "feat(reco-eval): 五类判定器(管线顺序互斥,码点破平)"
```

---

### Task 5: 指标聚合（纯函数，含 micro/macro/perJd）

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/metrics.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/metrics.test.ts`

**Interfaces (Produces):**

```ts
export interface PerJdRow {
  jobDescriptionId: string;
  positives: number;
  hits: number;
  failureCounts: Record<FailureClass, number>;
}
export interface Metrics {
  evaluated: number;
  jds: number;
  recallAt20Shown: number;
  recallAt20Raw: number;
  recallAt50Raw: number;
  mrr: number;
  macroRecallAt20Shown: number;
  macroRecallAt20Raw: number;
  macroRecallAt50Raw: number;
  macroMrr: number;
  failureCounts: Record<FailureClass, number>;
  perJd: PerJdRow[];
}
export function computeMetrics(verdicts: PositiveVerdict[]): Metrics;
```

> `evaluated` = 已评估 verdict 数（非总有效标签数；覆盖率的分母"总"由 Task 7 单独传）。

- [ ] **Step 1: 写测试（先失败）**

```ts
import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics";
import type { PositiveVerdict } from "./types";
const v = (o: Partial<PositiveVerdict>): PositiveVerdict => ({
  candidateId: "c",
  jobDescriptionId: "j",
  klass: "hit",
  rawRank: 1,
  score: 80,
  shownRank: 1,
  ...o,
});

describe("computeMetrics", () => {
  it("微平均 + MRR", () => {
    const m = computeMetrics([
      v({ klass: "hit", rawRank: 1 }),
      v({ klass: "recall_capped", rawRank: null }),
    ]);
    expect(m.recallAt20Shown).toBeCloseTo(0.5);
    expect(m.mrr).toBeCloseTo(0.5);
    expect(m.failureCounts.recall_capped).toBe(1);
    expect(m.evaluated).toBe(2);
  });
  it("宏平均按岗位 + perJd", () => {
    const m = computeMetrics([
      v({ jobDescriptionId: "j1", klass: "hit" }),
      v({ jobDescriptionId: "j2", klass: "hit" }),
      v({ jobDescriptionId: "j2", klass: "recall_capped", rawRank: null }),
    ]);
    expect(m.macroRecallAt20Shown).toBeCloseTo(0.75);
    expect(m.jds).toBe(2);
    expect(m.perJd.find((r) => r.jobDescriptionId === "j2")?.hits).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败** → Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/metrics` → FAIL。

- [ ] **Step 3: 实现**

```ts
import type { FailureClass, PositiveVerdict } from "./types";
const FAILS: FailureClass[] = [
  "not_indexed",
  "recall_capped",
  "status_filtered",
  "below_threshold",
  "retrieved_low_rank",
];
const emptyFails = () =>
  Object.fromEntries(FAILS.map((c) => [c, 0])) as Record<FailureClass, number>;
export interface PerJdRow {
  jobDescriptionId: string;
  positives: number;
  hits: number;
  failureCounts: Record<FailureClass, number>;
}
export interface Metrics {
  evaluated: number;
  jds: number;
  recallAt20Shown: number;
  recallAt20Raw: number;
  recallAt50Raw: number;
  mrr: number;
  macroRecallAt20Shown: number;
  macroRecallAt20Raw: number;
  macroRecallAt50Raw: number;
  macroMrr: number;
  failureCounts: Record<FailureClass, number>;
  perJd: PerJdRow[];
}
const rawWithin = (v: PositiveVerdict, k: number) => v.rawRank !== null && v.rawRank <= k;
export function computeMetrics(verdicts: PositiveVerdict[]): Metrics {
  const n = verdicts.length || 1;
  const failureCounts = emptyFails();
  const groups = new Map<string, PositiveVerdict[]>();
  let hit = 0,
    raw20 = 0,
    raw50 = 0,
    mrrSum = 0;
  for (const v of verdicts) {
    if (v.klass === "hit") hit += 1;
    else failureCounts[v.klass] += 1;
    if (rawWithin(v, 20)) raw20 += 1;
    if (rawWithin(v, 50)) raw50 += 1;
    mrrSum += v.rawRank !== null ? 1 / v.rawRank : 0;
    groups.set(v.jobDescriptionId, [...(groups.get(v.jobDescriptionId) ?? []), v]);
  }
  const perJd: PerJdRow[] = [...groups.entries()].map(([jobDescriptionId, vs]) => {
    const fc = emptyFails();
    for (const v of vs) if (v.klass !== "hit") fc[v.klass] += 1;
    return {
      failureCounts: fc,
      hits: vs.filter((v) => v.klass === "hit").length,
      jobDescriptionId,
      positives: vs.length,
    };
  });
  const macro = (f: (vs: PositiveVerdict[]) => number) =>
    perJd.length ? [...groups.values()].reduce((s, vs) => s + f(vs), 0) / groups.size : 0;
  return {
    evaluated: verdicts.length,
    failureCounts,
    jds: groups.size,
    perJd,
    macroMrr: macro(
      (vs) => vs.reduce((s, v) => s + (v.rawRank ? 1 / v.rawRank : 0), 0) / vs.length,
    ),
    macroRecallAt20Raw: macro((vs) => vs.filter((v) => rawWithin(v, 20)).length / vs.length),
    macroRecallAt20Shown: macro((vs) => vs.filter((v) => v.klass === "hit").length / vs.length),
    macroRecallAt50Raw: macro((vs) => vs.filter((v) => rawWithin(v, 50)).length / vs.length),
    mrr: mrrSum / n,
    recallAt20Raw: raw20 / n,
    recallAt20Shown: hit / n,
    recallAt50Raw: raw50 / n,
  };
}
```

- [ ] **Step 4: 跑测试确认通过** → PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/metrics.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/metrics.test.ts
git commit -m "feat(reco-eval): 指标聚合(micro/macro/MRR/perJd/五类)"
```

---

### Task 6: 标签挖掘(B) + 有效键 + 向量存在性 DB/Qdrant glue

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/mine-labels.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/lib/server/qdrant/resume-vector-store.ts`（加只读 `hasCollection`）
- Test: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/mine-labels.test.ts`

**Interfaces (Produces):**

```ts
export function isMinedPositive(row: {
  outcome: string;
  pipelineStage: string;
  previousStage: string | null;
}): boolean;
export function mineLabels(organizationId: string): Promise<PositiveLabel[]>; // source:"mined"
export function loadValidLabelKeys(organizationId: string): Promise<Set<string>>; // 存在+绑定+ready 的 `${jd}::${id}`
```

`QdrantResumeVectorStore` 加：`async hasCollection(): Promise<boolean>`。

- [ ] **Step 1: 写 isMinedPositive 单测（先失败）**

```ts
import { describe, expect, it } from "vitest";
import { isMinedPositive } from "./mine-labels";
const P = (outcome: string, pipelineStage: string, previousStage: string | null = null) => ({
  outcome,
  pipelineStage,
  previousStage,
});
describe("isMinedPositive", () => {
  it("ai_interview 正例", () =>
    expect(isMinedPositive(P("in_pipeline", "ai_interview"))).toBe(true));
  it("screening in_pipeline 非正例", () =>
    expect(isMinedPositive(P("in_pipeline", "screening"))).toBe(false));
  it("初筛拒非正例", () =>
    expect(isMinedPositive(P("rejected", "closed", "screening"))).toBe(false));
  it("后期拒(已知进阶阶段)正例", () =>
    expect(isMinedPositive(P("rejected", "closed", "ai_interview"))).toBe(true));
  it("后期拒但 previousStage=null 非正例", () =>
    expect(isMinedPositive(P("rejected", "closed", null))).toBe(false));
  it("hired 正例", () => expect(isMinedPositive(P("hired", "closed", "offer"))).toBe(true));
  it("withdrawn 非正例", () =>
    expect(isMinedPositive(P("withdrawn", "closed", "ai_interview"))).toBe(false));
  it("archived 非正例", () =>
    expect(isMinedPositive(P("archived", "closed", "offer"))).toBe(false));
});
```

- [ ] **Step 2: 跑测试确认失败** → FAIL。

- [ ] **Step 3: 实现 mine-labels.ts**

```ts
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { studioInterview } from "@arc/db-schema/schema";
import { labelKey } from "./labels";
import type { PositiveLabel } from "./types";

const ADVANCED = new Set(["written_test", "ai_interview", "human_interview", "offer"]);
export function isMinedPositive(row: {
  outcome: string;
  pipelineStage: string;
  previousStage: string | null;
}): boolean {
  if (row.outcome === "withdrawn" || row.outcome === "archived") return false;
  if (row.outcome === "hired") return true;
  if (ADVANCED.has(row.pipelineStage)) return true;
  return (
    row.outcome === "rejected" && row.previousStage !== null && ADVANCED.has(row.previousStage)
  );
}
export async function mineLabels(organizationId: string): Promise<PositiveLabel[]> {
  const rows = await db
    .select({
      id: studioInterview.id,
      jobDescriptionId: studioInterview.jobDescriptionId,
      outcome: studioInterview.outcome,
      pipelineStage: studioInterview.pipelineStage,
      closedMeta: studioInterview.closedMeta,
    })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.organizationId, organizationId),
        isNotNull(studioInterview.jobDescriptionId),
      ),
    );
  return rows
    .filter((r) =>
      isMinedPositive({
        outcome: String(r.outcome),
        pipelineStage: String(r.pipelineStage),
        previousStage: (r.closedMeta as { previousStage?: string } | null)?.previousStage ?? null,
      }),
    )
    .map((r) => ({
      candidateId: r.id,
      jobDescriptionId: r.jobDescriptionId as string,
      label: "positive" as const,
      source: "mined" as const,
    }));
}
export async function loadValidLabelKeys(organizationId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: studioInterview.id, jobDescriptionId: studioInterview.jobDescriptionId })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.organizationId, organizationId),
        isNotNull(studioInterview.jobDescriptionId),
        eq(studioInterview.resumeParseStatus, "ready"),
      ),
    );
  return new Set(
    rows
      .filter((r) => r.jobDescriptionId)
      .map((r) => labelKey({ candidateId: r.id, jobDescriptionId: r.jobDescriptionId as string })),
  );
}
```

- [ ] **Step 4: 给 QdrantResumeVectorStore 加只读 `hasCollection`**

Read `resume-vector-store.ts:166`（`ensureCollection` 内的 `this.client.collectionExists(this.collectionName)` 用法），在类内加：

```ts
async hasCollection(): Promise<boolean> {
  const res = await this.client.collectionExists(this.collectionName);
  return res.exists === true;
}
```

- [ ] **Step 5: 跑测试确认通过** → Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/mine-labels` → PASS（纯判定 8 例）。

- [ ] **Step 6: typecheck**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck`
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/mine-labels.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/mine-labels.test.ts apps/ai-recruitment-copilot-backend/src/lib/server/qdrant/resume-vector-store.ts
git commit -m "feat(reco-eval): B标签挖掘(排除null/withdrawn/archived)+有效键+只读hasCollection"
```

---

### Task 7: 评测编排(可注入可测) + 报告 + CLI

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/run.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/report.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval.ts`（CLI）
- Modify: `apps/ai-recruitment-copilot-backend/package.json`；`.gitignore`（根）
- Test: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/run.test.ts`、`report.test.ts`

**Interfaces (Produces):**

```ts
export interface RunEvalDeps {
  loadJd: (
    org: string,
    id: string,
  ) => Promise<{ id: string; name: string; description: string | null; prompt: string } | null>;
  score: (input: ScoreCoreInput) => Promise<ScoreCoreResult>;
  hasVector: (candidateId: string) => Promise<boolean>;
}
export function runEval(o: {
  organizationId: string;
  labels: PositiveLabel[];
  deps: RunEvalDeps;
}): Promise<{
  verdicts: PositiveVerdict[];
  metrics: Metrics;
  coverage: number;
  failedJds: string[];
  evaluated: number;
  total: number;
}>;
export function formatReport(i: ReportInput): string;
```

- [ ] **Step 1: runEval 单测（注入 fake，先失败）**

```ts
import { describe, expect, it, vi } from "vitest";
import { runEval } from "./run";
import type { PositiveLabel } from "./types";
const lab = (jd: string, c: string): PositiveLabel => ({
  candidateId: c,
  jobDescriptionId: jd,
  label: "positive",
  source: "mined",
});
const okJd = { description: "d", id: "j", name: "n", prompt: "p" };

describe("runEval", () => {
  it("命中并算覆盖率", async () => {
    const deps = {
      loadJd: vi.fn(() => Promise.resolve(okJd)),
      score: vi.fn(() =>
        Promise.resolve({
          loadedIds: new Set(["c1"]),
          ranked: [{ candidateId: "c1", score: 80 }],
          retrievedIds: new Set(["c1"]),
        }),
      ),
      hasVector: vi.fn(() => Promise.resolve(true)),
    };
    const r = await runEval({
      deps: deps as never,
      labels: [lab("j", "c1")],
      organizationId: "org",
    });
    expect(r.metrics.recallAt20Shown).toBe(1);
    expect(r.coverage).toBe(1);
  });
  it("整岗远程失败时该岗正例整体排除(不混入部分样本)", async () => {
    const deps = {
      loadJd: vi.fn(() => Promise.resolve(okJd)),
      score: vi.fn(() =>
        Promise.resolve({
          loadedIds: new Set(["c1"]),
          ranked: [{ candidateId: "c1", score: 80 }],
          retrievedIds: new Set(["c1"]),
        }),
      ),
      hasVector: vi.fn((id: string) =>
        id === "c2" ? Promise.reject(new Error("qdrant timeout")) : Promise.resolve(true),
      ),
    };
    const r = await runEval({
      deps: deps as never,
      labels: [lab("j", "c1"), lab("j", "c2")],
      organizationId: "org",
    });
    expect(r.failedJds).toEqual(["j"]);
    expect(r.evaluated).toBe(0); // c1 的 verdict 也被丢弃(整岗原子)
    expect(r.verdicts).toHaveLength(0);
    expect(r.coverage).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败** → FAIL。

- [ ] **Step 3: 实现 run.ts**

```ts
import type {
  ScoreCoreInput,
  ScoreCoreResult,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/utils/recommendations";
import { classifyPositive } from "./classify";
import { computeMetrics } from "./metrics";
import type { PositiveLabel, PositiveVerdict } from "./types";

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw last;
}
export interface RunEvalDeps {
  loadJd: (
    org: string,
    id: string,
  ) => Promise<{ id: string; name: string; description: string | null; prompt: string } | null>;
  score: (input: ScoreCoreInput) => Promise<ScoreCoreResult>;
  hasVector: (candidateId: string) => Promise<boolean>;
}
export async function runEval(o: {
  organizationId: string;
  labels: PositiveLabel[];
  deps: RunEvalDeps;
}) {
  const byJd = new Map<string, string[]>();
  for (const l of o.labels)
    byJd.set(l.jobDescriptionId, [...(byJd.get(l.jobDescriptionId) ?? []), l.candidateId]);
  const verdicts: PositiveVerdict[] = [];
  const failedJds: string[] = [];
  let evaluated = 0;
  for (const [jobDescriptionId, ids] of byJd) {
    const jd = await o.deps.loadJd(o.organizationId, jobDescriptionId); // 抛错=致命(DB)，向上传播
    if (!jd) {
      failedJds.push(jobDescriptionId);
      continue;
    }
    let core: ScoreCoreResult;
    try {
      core = await withRetry(() =>
        o.deps.score({
          excludeLinkedExceptIds: new Set(ids),
          jobDescription: {
            departmentName: null,
            description: jd.description,
            id: jd.id,
            name: jd.name,
            prompt: jd.prompt,
          },
          organizationId: o.organizationId,
        }),
      );
    } catch {
      failedJds.push(jobDescriptionId);
      continue;
    }
    const local: PositiveVerdict[] = [];
    let jdFailed = false;
    for (const candidateId of ids) {
      let has: boolean;
      try {
        has = await withRetry(() => o.deps.hasVector(candidateId));
      } catch {
        jdFailed = true;
        break;
      }
      local.push(classifyPositive({ candidateId, core, hasAnyVector: has, jobDescriptionId })); // 纯函数在 try 外，bug 会传播
    }
    if (jdFailed) {
      failedJds.push(jobDescriptionId);
      continue;
    } // 丢弃 local(整岗原子)
    verdicts.push(...local);
    evaluated += ids.length;
  }
  const total = o.labels.length;
  return {
    coverage: total ? evaluated / total : 0,
    evaluated,
    failedJds,
    metrics: computeMetrics(verdicts),
    total,
    verdicts,
  };
}
```

> `jobDescription` 需 `departmentName` 字段；`RecommendJobDescription` 含它，这里补 `null`（推荐查询文本不含部门时不影响）。

- [ ] **Step 4: 跑 runEval 测试确认通过** → PASS（两例）。

- [ ] **Step 5: report.ts 测试（先失败）**

```ts
import { describe, expect, it } from "vitest";
import { formatReport } from "./report";
const metrics = {
  evaluated: 2,
  jds: 1,
  recallAt20Shown: 0.5,
  recallAt20Raw: 0.5,
  recallAt50Raw: 1,
  mrr: 0.5,
  macroRecallAt20Shown: 0.5,
  macroRecallAt20Raw: 0.5,
  macroRecallAt50Raw: 1,
  macroMrr: 0.5,
  failureCounts: {
    not_indexed: 0,
    recall_capped: 1,
    status_filtered: 0,
    below_threshold: 0,
    retrieved_low_rank: 0,
  },
  perJd: [
    {
      jobDescriptionId: "j",
      positives: 2,
      hits: 1,
      failureCounts: {
        not_indexed: 0,
        recall_capped: 1,
        status_filtered: 0,
        below_threshold: 0,
        retrieved_low_rank: 0,
      },
    },
  ],
};
const meta = {
  collection: "resume_semantic_v1",
  embedding: "text-embedding-v4@v1",
  gitSha: "abc",
  labelHash: "h",
  mode: "b-only",
  org: "org_default",
  recall: "[40,50,50] th=55 topK=20",
  sourceCounts: "mined=2 manual=0 invalid=0",
  startedAt: "t0",
  endedAt: "t1",
  total: 2,
};
describe("formatReport", () => {
  it("含元数据/覆盖率/五类/宏平均/按岗表", () => {
    const s = formatReport({ coverage: 1, failedJds: [], meta, metrics });
    for (const k of [
      "recall@20_shown",
      "recall_capped",
      "覆盖率",
      "git=abc",
      "embedding=text-embedding-v4@v1",
      "宏平均",
      "按岗位",
    ])
      expect(s).toContain(k);
  });
  it("覆盖率<80% 标警告", () => {
    expect(formatReport({ coverage: 0.5, failedJds: ["jX"], meta, metrics })).toContain("⚠️");
  });
});
```

- [ ] **Step 6: 实现 report.ts**

```ts
import type { Metrics } from "./metrics";
export interface ReportInput {
  metrics: Metrics;
  coverage: number;
  failedJds: string[];
  meta: {
    org: string;
    mode: string;
    startedAt: string;
    endedAt: string;
    gitSha: string;
    labelHash: string;
    embedding: string;
    collection: string;
    recall: string;
    sourceCounts: string;
    total: number;
  };
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
export function formatReport(i: ReportInput): string {
  const { metrics: m, meta } = i;
  const rows = m.perJd.map(
    (r) =>
      `  ${r.jobDescriptionId} | 正例${r.positives} | 命中${r.hits} | cap${r.failureCounts.recall_capped} low${r.failureCounts.retrieved_low_rank} thr${r.failureCounts.below_threshold} nidx${r.failureCounts.not_indexed} sf${r.failureCounts.status_filtered}`,
  );
  return [
    `== 岗位人才推荐 召回基线 (${meta.org}, ${meta.mode}) ==`,
    `运行: ${meta.startedAt} → ${meta.endedAt} (快照近似)`,
    `元数据: git=${meta.gitSha} 标签哈希=${meta.labelHash} embedding=${meta.embedding} collection=${meta.collection}`,
    `        召回=${meta.recall} 标签: ${meta.sourceCounts}`,
    `已评估/总正例: ${m.evaluated}/${meta.total}  覆盖岗位: ${m.jds}`,
    `评估覆盖率: ${pct(i.coverage)}${i.coverage < 0.8 ? " ⚠️ 选择性偏差" : ""}`,
    `[微平均] recall@20_shown=${pct(m.recallAt20Shown)} recall@20_raw=${pct(m.recallAt20Raw)} recall@50_raw=${pct(m.recallAt50Raw)} MRR=${m.mrr.toFixed(3)}`,
    `[宏平均] recall@20_shown=${pct(m.macroRecallAt20Shown)} recall@20_raw=${pct(m.macroRecallAt20Raw)} recall@50_raw=${pct(m.macroRecallAt50Raw)} MRR=${m.macroMrr.toFixed(3)}`,
    `失败拆分: not_indexed=${m.failureCounts.not_indexed} recall_capped=${m.failureCounts.recall_capped} status_filtered=${m.failureCounts.status_filtered} below_threshold=${m.failureCounts.below_threshold} retrieved_low_rank=${m.failureCounts.retrieved_low_rank}`,
    "按岗位:",
    ...rows,
    `未评估(远程失败)岗位: ${i.failedJds.length ? i.failedJds.join(", ") : "无"}`,
  ].join("\n");
}
```

- [ ] **Step 7: 跑 report 测试确认通过** → PASS。

- [ ] **Step 8: 实现 CLI `reco-eval.ts`**

```ts
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getResumeEmbeddingConfig } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/embedding";
import { embedResumeSemanticTexts } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/embedding";
import { getResumeSemanticIndexConfig } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer";
import { QdrantResumeVectorStore } from "@arc/ai-recruitment-copilot-backend/lib/server/qdrant/resume-vector-store";
import { loadJobDescriptionById } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import {
  createDefaultRecommendationDeps,
  scoreCandidatesForJobDescription,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/utils/recommendations";
import { dedupeLabels, validateLabels } from "./reco-eval/labels";
import { loadValidLabelKeys, mineLabels } from "./reco-eval/mine-labels";
import { formatReport } from "./reco-eval/report";
import { runEval } from "./reco-eval/run";
import type { PositiveLabel } from "./reco-eval/types";

function arg(name: string, fallback?: string): string {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const org = arg("org", "org_default");
  const mode = arg("mode", "b-only");
  const strict = hasFlag("strict");
  const startedAt = new Date().toISOString();
  const embeddingConfig = getResumeEmbeddingConfig();
  const semantic = getResumeSemanticIndexConfig();
  if (!(semantic.qdrantUrl && embeddingConfig.apiKey)) throw new Error("语义配置未启用");
  const store = new QdrantResumeVectorStore({
    apiKey: semantic.qdrantApiKey,
    collectionName: semantic.qdrantCollectionName,
    dimensions: embeddingConfig.dimensions,
    url: semantic.qdrantUrl,
  });
  if (!(await store.hasCollection()))
    throw new Error(`collection ${semantic.qdrantCollectionName} 不存在（只读评测拒绝创建）`);

  const mined = await mineLabels(org);
  const fromFile: PositiveLabel[] =
    mode === "a-plus-b" ? JSON.parse(readFileSync(arg("labels"), "utf8")) : [];
  const { labels: deduped, conflicts } = dedupeLabels([...mined, ...fromFile]);
  const validKeys = await loadValidLabelKeys(org);
  const { valid, invalid } = validateLabels(deduped, validKeys);

  const deps = { ...createDefaultRecommendationDeps(), vectorStore: store };
  const result = await runEval({
    deps: {
      hasVector: async (id: string) =>
        (await store.loadResumeEmbeddings({ sourceId: id })).length > 0,
      loadJd: (o: string, id: string) => loadJobDescriptionById(o, id),
      score: (input) => scoreCandidatesForJobDescription(input, deps),
    },
    labels: valid,
    organizationId: org,
  });

  const endedAt = new Date().toISOString();
  const report = formatReport({
    coverage: result.coverage,
    failedJds: result.failedJds,
    metrics: result.metrics,
    meta: {
      collection: semantic.qdrantCollectionName,
      conflicts,
      embedding: `${embeddingConfig.model}@${semantic.embeddingVersion}`,
      endedAt,
      gitSha: execSync("git rev-parse --short HEAD").toString().trim(),
      labelHash: createHash("sha256").update(JSON.stringify(valid)).digest("hex").slice(0, 12),
      mode,
      org,
      recall: "[40,50,50] th=55 topK=20",
      sourceCounts: `mined=${mined.length} manual=${fromFile.length} invalid=${invalid}`,
      startedAt,
      total: valid.length,
    } as never,
  });

  mkdirSync(".eval", { recursive: true });
  const stamp = startedAt.replaceAll(/[:.]/g, "-");
  writeFileSync(".eval/labels.json", JSON.stringify(mined, null, 2)); // b-only 种子，供 A 补强
  writeFileSync(`.eval/report-${mode}-${stamp}.md`, `${report}\n`);
  writeFileSync(
    `.eval/detail-${mode}-${stamp}.jsonl`,
    result.verdicts.map((v) => JSON.stringify(v)).join("\n"),
  );
  console.info(report);
  if (result.evaluated === 0) throw new Error("evaluated=0（全部岗位失败/无有效标签）");
  if (strict && result.coverage < 0.8)
    throw new Error(`覆盖率 ${(result.coverage * 100).toFixed(1)}% < 80% (--strict)`);
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
```

> `formatReport` 的 `meta` 里多传的 `conflicts` 用 `as never` 容错；如需展示，扩 `ReportInput.meta` 加 `conflicts`。`loadResumeEmbeddings` 返回形状：落地时 Read `resume-vector-store.ts:254-303` 确认 `{sourceId}` 入参与返回数组。

- [ ] **Step 9: package.json script + .gitignore**

`apps/ai-recruitment-copilot-backend/package.json` 的 `"scripts"` 加：`"eval:recommendations": "tsx src/scripts/reco-eval.ts"`。
仓库根 `.gitignore` 追加：`.eval/`。

- [ ] **Step 10: typecheck + reco-eval 全量单测**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck && pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval`
Expected: 无类型错误；labels/classify/metrics/mine-labels/run/report 全绿。

- [ ] **Step 11: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/run.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/run.test.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/report.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/report.test.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval.ts apps/ai-recruitment-copilot-backend/package.json .gitignore
git commit -m "feat(reco-eval): 编排(可注入/整岗原子/致命上抛)+报告(元数据+按岗)+CLI(labels.json/strict)"
```

---

### Task 8: 跑 B-only 基线（真实运行，非代码）

**Files:** 无（产出落 `.eval/`，gitignore）。

- [ ] **Step 1: 确认 backend 能读到语义 env**

standalone 脚本进程需读到 `RESUME_SEMANTIC_INDEX_ENABLED/QDRANT_URL/QDRANT_API_KEY/RESUME_EMBEDDING_*/DATABASE_URL`。**优先用现有加载机制**（如脚本已由 dotenv/backend 启动加载 `apps/ai-recruitment-copilot-backend/.env`）。若该 .env 不存在，**不复制粘贴密钥**，而是用 `env $(...)` 或 `dotenv -e ../ai-recruitment-copilot/.env` 指向现有 web .env 运行，避免密钥扩散。

- [ ] **Step 2: 运行 B-only**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend eval:recommendations --org org_default --mode b-only`
Expected: 控制台打印基线报告；`.eval/report-b-only-*.md`、`detail-*.jsonl`、`labels.json` 生成。

- [ ] **Step 3: 判读并回填决策**

看 `失败拆分`：`recall_capped` 占主导 → ①放开召回上限优先；`retrieved_low_rank` 主导 → ②重排优先；`not_indexed` 多 → 先补索引覆盖。**注意**：recall_capped 只证明"未进当前 top-K"，不单独证明分面/查询表达无责；结论写"最可能"而非"唯一元凶"。把取舍回填规范文档 §11。

- [ ] **Step 4: 留档（脱敏）**

`.eval/report-*.md` 无 PII，可摘要贴入知识库 `1.极光矩阵/10.AI面试官/需求/`；`detail-*.jsonl`（含 candidateId）留本地。

---

## Self-Review

**Spec coverage：** §3.1 挖标签(修 null/withdrawn/archived)→Task6；§3.4 去重+校验→Task3；§4.1 分组LOO豁免→Task2 `excludeLinkedExceptIds`+Task7 传 `new Set(ids)`；§4.2 按岗一次评分→Task7；§4.3 破平仅评测(码点)→Task4；§4.4 只读/不建collection→Task2(内核无ensure)+Task6(hasCollection)+Task7(CLI 断言);§4.5 五类→Task4；§5 指标(micro/macro/覆盖率)→Task5+Task7；§6.1 运行契约(labels/mode/strict/退出码)→Task7 CLI；§7 重构+特征化→Task1/2；§8 报告(元数据+按岗)→Task7；§9 测试→各Task+run/report单测；§10 覆盖率下限/维度/PII→Task7(strict、维度校验见下、.gitignore)。

**已修 codex 第三轮全部 🔴：** ensureCollection移出内核(T2)、ranked携带完整记录(T2)、store注入内核(T7)、collectionExists改必存在断言(T6 hasCollection+T7)、arg解析修 argv[0](T7)、整岗原子排除(T7+测试)、致命错上抛(T7 loadJd在try外/evaluated=0退出)、isMinedPositive修null/withdrawn/archived(T6)、macro全指标(T5)、正例数total与evaluated分开(T5/T7)、labels.json写出(T7)、a-plus-b读文件+strict实现(T7)、报告元数据+按岗表(T7)、runEval有测试(T7)、码点破平(T4)、PositiveLabel保留label字段(types)。

**Placeholder scan：** 无 TODO/注释占位；a-plus-b/strict 均在 Task7 落地为可执行步骤。

**Type consistency：** `PositiveLabel/PositiveVerdict/ScoreCoreResult/Metrics/RunEvalDeps` 跨 Task2/3/4/5/7 同名同形；`scoreCandidatesForJobDescription`/`classifyPositive`/`computeMetrics`/`runEval`/`formatReport`/`mineLabels`/`dedupeLabels`/`validateLabels` 签名各任务一致。

**落地时需现场核对（实现者第一步 Read 确认）：**

1. `loadRecommendationCandidates` select 列名（T1/T2 fixture）。
2. `resume-vector-store.ts` 的 `loadResumeEmbeddings({sourceId})` 入参/返回、`client.collectionExists` 返回形状（T6 hasCollection、T7 hasVector）。
3. **embedding 维度/模型兼容**（§10）：CLI 已断言 collection 存在；维度用 `embeddingConfig.dimensions` 传入 store 构造，与 collection 维度不符时 Qdrant 查询会报错→非零退出。模型语义版本无法从 collection 元数据校验，报告记录 `embedding=model@version` 供人工核对（文档化限制）。
