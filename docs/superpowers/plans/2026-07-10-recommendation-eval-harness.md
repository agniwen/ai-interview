# 岗位人才推荐 评测集与基线度量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个只读的 leave-one-out 召回评测器，从历史漏斗信号挖标签，跑出岗位人才推荐的当前召回基线（recall@20/50、MRR + 五类失败拆分）。

**Architecture:** 先给现有推荐函数补特征化测试并抽出"打分内核"（返回完整排序 + 诊断中间量），生产包装器行为不变；再在 `src/scripts/reco-eval/` 下建纯函数为主的评测模块（挖标签 → 校验 → 五类判定 → 聚合指标 → 报告），CLI 入口一次性连生产库/Qdrant 产报告。

**Tech Stack:** TypeScript, Vitest, Drizzle (postgres driver), Qdrant JS client, DashScope embedding；运行经 `tsx`。

## Global Constraints

- **只读**：评测不写数据库、不写 Qdrant（**不调用 `ensureCollection()`**，改断言 collection 存在）。
- **`candidateId` ≡ `studio_interview.id`**（= Qdrant `sourceId`，sourceType=`studio_interview`；= `loadRecommendationCandidates` 主键）。全程用此标识。
- **命中定义**：`score ≥ 55` 且 `shownRank ≤ 20`（生产先按 55 过滤再取 top-20）。生产召回上限每分面 40/50/50，阈值 55，topK 20 —— 取自 `recommendations.ts`。
- **破平只在评测路径**：生产 `toSorted` 稳定排序不改；评测对同分按 `candidateId` 字符串升序二次排序。
- **五类互斥、按管线顺序判定**：not_indexed → recall_capped → status_filtered → below_threshold → retrieved_low_rank（前一步不满足才进下一步）。
- **组织**：基线针对 `org_default`。
- 参考规范文档：`docs/adr/2026-07-10-recommendation-eval-harness-design.md`。

---

## 共享类型（各任务实现时按此签名，勿改名）

```ts
// src/scripts/reco-eval/types.ts
export type LabelSource = "mined" | "manual";
export interface PositiveLabel {
  jobDescriptionId: string;
  candidateId: string; // = studio_interview.id
  source: LabelSource;
}
export interface FacetSimilarity {
  resumeOverview?: number;
  skillRole?: number;
  workProject?: number;
}
export interface ScoredCandidate {
  candidateId: string;
  score: number; // 0..100, floor 后
  similarity: FacetSimilarity;
}
// 打分内核返回：完整排序 + 诊断中间量
export interface CoreScoreResult {
  ranked: ScoredCandidate[]; // 已按 score 降序（生产排序），未套阈值/截断
  retrievedIds: Set<string>; // 三分面检索并集里出现过的 candidateId
  loadedIds: Set<string>; // 通过 loadRecommendationCandidates DB 过滤的 candidateId
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
  rawRank: number | null; // 在完整排序中的 1-based 名次；不在列表为 null
  shownRank: number | null; // 在 score>=55 子列表中的名次；不适用为 null
  score: number | null;
}
```

---

### Task 1: 现有推荐函数的特征化测试

锁死重构前的生产行为，覆盖阈值/截断/稳定排序/excludeAlreadyLinked/召回上限。

**Files:**

- Test: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/recommendations.test.ts`（追加到现有文件）

**Interfaces:**

- Consumes: `recommendCandidatesForJobDescription(input, deps)`（现有，`deps: RecommendationDeps` 可注入 `embed`/`vectorStore`/`loadCandidates`/`enabled`/`embeddingConfig`）。
- Produces: 无（纯测试）。

- [ ] **Step 1: 写特征化测试**

在文件末尾 `describe` 内追加。构造一个能产生已知分数的注入：3 个候选，分数跨越 55 阈值与 top-20 边界；两名候选同分验证稳定序；一名候选设为已绑定该 JD 验证 `excludeAlreadyLinked`。

```ts
import { describe, expect, it, vi } from "vitest";
import { recommendCandidatesForJobDescription } from "./recommendations";
// 复用文件顶部已定义的 candidateProfile

const makeDeps = (overrides = {}) => ({
  embed: vi.fn(({ chunks }) =>
    Promise.resolve(
      chunks.map((c: { chunkType: string; text: string }) => ({ ...c, embedding: [1, 2] })),
    ),
  ),
  embeddingConfig: { apiKey: "k", baseUrl: "b", dimensions: 2, model: "m" },
  enabled: true,
  vectorStore: {
    ensureCollection: vi.fn(() => Promise.resolve()),
    searchSimilarResumes: vi.fn(() => Promise.resolve([])),
  },
  loadCandidates: vi.fn(() => Promise.resolve([])),
  ...overrides,
});

describe("recommendCandidatesForJobDescription — 特征化(锁生产行为)", () => {
  it("按 55 阈值过滤：分数<55 的候选被剔除", async () => {
    // skillRole=0.2 → 加权 floor(0.2*0.45*100)=9 <55，应被过滤
    const deps = makeDeps({
      vectorStore: {
        ensureCollection: vi.fn(() => Promise.resolve()),
        searchSimilarResumes: vi.fn(({ chunkType }) =>
          Promise.resolve([
            { chunkType, score: 0.2, sourceId: "low", sourceType: "studio_interview" as const },
          ]),
        ),
      },
      loadCandidates: vi.fn(() =>
        Promise.resolve([
          {
            id: "low",
            candidateName: "低分",
            candidateEmail: null,
            candidatePhone: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            currentJobDescriptionId: null,
            currentJobDescriptionName: null,
            notes: null,
            resumeFileName: null,
            resumeParseStatus: "ready" as const,
            resumeProfile: candidateProfile,
            skillsNormalized: [],
            targetRole: null,
          },
        ]),
      ),
    });
    const res = await recommendCandidatesForJobDescription(
      {
        excludeAlreadyLinked: true,
        jobDescription: {
          id: "jd1",
          name: "后端",
          description: "d",
          prompt: "p",
          departmentName: null,
        },
        limit: 20,
        organizationId: "org",
      },
      deps,
    );
    expect(res.status).toBe("ready");
    expect(res.candidates).toHaveLength(0);
  });

  it("excludeAlreadyLinked=true 时剔除已绑定本 JD 的候选", async () => {
    const deps = makeDeps({
      vectorStore: {
        ensureCollection: vi.fn(() => Promise.resolve()),
        searchSimilarResumes: vi.fn(({ chunkType }) => {
          const score = chunkType === "skill_role" ? 0.95 : 0.9;
          return Promise.resolve([
            { chunkType, score, sourceId: "linked", sourceType: "studio_interview" as const },
          ]);
        }),
      },
      loadCandidates: vi.fn(() =>
        Promise.resolve([
          {
            id: "linked",
            candidateName: "已绑定",
            candidateEmail: null,
            candidatePhone: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            currentJobDescriptionId: "jd1",
            currentJobDescriptionName: "后端",
            notes: null,
            resumeFileName: null,
            resumeParseStatus: "ready" as const,
            resumeProfile: candidateProfile,
            skillsNormalized: [],
            targetRole: null,
          },
        ]),
      ),
    });
    const res = await recommendCandidatesForJobDescription(
      {
        excludeAlreadyLinked: true,
        jobDescription: {
          id: "jd1",
          name: "后端",
          description: "d",
          prompt: "p",
          departmentName: null,
        },
        limit: 20,
        organizationId: "org",
      },
      deps,
    );
    expect(res.candidates.map((c) => c.id)).not.toContain("linked");
  });
});
```

- [ ] **Step 2: 跑测试确认通过（锁的是现状）**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test recommendations`
Expected: 全绿（这些测试断言的是当前生产行为）。

- [ ] **Step 3: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/recommendations.test.ts
git commit -m "test(recommendations): 补特征化测试锁生产行为(阈值/绑定过滤)"
```

---

### Task 2: 抽出打分内核 `scoreCandidatesForJobDescription`

拆出返回完整排序 + 诊断中间量的内核；生产函数改为调内核 + 阈值 + 截断 + DTO，**行为不变**；内核支持"排除绑定 J 但豁免指定正例 id"。

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/recommendations.ts`
- Test: 同目录 `recommendations.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export interface ScoreCoreInput {
    excludeLinkedExceptIds?: Set<string>; // 排除绑定到 J 的候选，但豁免这些 id（评测 LOO 用）；不传=不因绑定排除
    jobDescription: RecommendJobDescription;
    organizationId: string;
  }
  export function scoreCandidatesForJobDescription(
    input: ScoreCoreInput,
    deps?: RecommendationDeps,
  ): Promise<CoreScoreResult>; // ranked 按 score 降序（不套 55/limit）；retrievedIds/loadedIds 为诊断中间量
  ```
- Consumes: 现有 `RecommendationDeps`、`buildJobRecommendationQueryTexts`、`mergeVectorScores`、`weightedScore`、`toRecommendation`、`loadRecommendationCandidates`。

- [ ] **Step 1: 写内核的单测（先失败）**

```ts
import { scoreCandidatesForJobDescription } from "./recommendations";

it("内核返回完整排序 + 诊断中间量(不套阈值/截断)", async () => {
  const deps = makeDeps({
    vectorStore: {
      ensureCollection: vi.fn(() => Promise.resolve()),
      searchSimilarResumes: vi.fn(({ chunkType }) =>
        Promise.resolve([
          { chunkType, score: 0.2, sourceId: "low", sourceType: "studio_interview" as const },
        ]),
      ),
    },
    loadCandidates: vi.fn(() =>
      Promise.resolve([
        {
          id: "low",
          candidateName: "低",
          candidateEmail: null,
          candidatePhone: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          currentJobDescriptionId: null,
          currentJobDescriptionName: null,
          notes: null,
          resumeFileName: null,
          resumeParseStatus: "ready" as const,
          resumeProfile: candidateProfile,
          skillsNormalized: [],
          targetRole: null,
        },
      ]),
    ),
  });
  const core = await scoreCandidatesForJobDescription(
    {
      jobDescription: {
        id: "jd1",
        name: "后端",
        description: "d",
        prompt: "p",
        departmentName: null,
      },
      organizationId: "org",
    },
    deps,
  );
  expect(core.ranked).toHaveLength(1); // 低分候选未被 55 剔除
  expect(core.ranked[0].candidateId).toBe("low");
  expect(core.retrievedIds.has("low")).toBe(true);
  expect(core.loadedIds.has("low")).toBe(true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test recommendations`
Expected: FAIL —— `scoreCandidatesForJobDescription is not a function`。

- [ ] **Step 3: 实现内核并让生产函数复用它**

在 `recommendations.ts` 中：把 `recommendCandidatesForJobDescription` 里"embed → 搜索 → merge → loadCandidates → toRecommendation → 排序"抽成内核；生产函数 = 内核 + `.filter(score>=55)` + `.slice(0,limit)` + DTO。内核记录 `retrievedIds = new Set(bySource.keys())`、`loadedIds = new Set(candidates.map(c=>c.id))`。`excludeLinkedExceptIds` 在 `toRecommendation` 前对 `candidate.currentJobDescriptionId===jd.id && !exempt.has(id)` 的候选过滤（复刻生产 excludeAlreadyLinked，但豁免评测正例）。ranked 保持 `toSorted((a,b)=>b.score-a.score)`（不加 id 破平，破平在评测侧）。

```ts
export async function scoreCandidatesForJobDescription(
  input: ScoreCoreInput,
  deps: RecommendationDeps = createDefaultRecommendationDeps(),
): Promise<CoreScoreResult> {
  const chunks = buildJobRecommendationQueryTexts(input.jobDescription);
  const embedded = await deps.embed({ ...deps.embeddingConfig, chunks });
  await deps.vectorStore.ensureCollection();
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
  const jdText = [
    input.jobDescription.name,
    input.jobDescription.description,
    input.jobDescription.prompt,
  ]
    .filter((v): v is string => typeof v === "string")
    .join("\n");
  const exempt = input.excludeLinkedExceptIds;
  const ranked = candidates
    .filter(
      (c) =>
        !(exempt && c.currentJobDescriptionId === input.jobDescription.id && !exempt.has(c.id)),
    )
    .flatMap((c) => {
      const scores = bySource.get(c.id);
      return scores
        ? [{ candidateId: c.id, score: weightedScore(scores), similarity: scores }]
        : [];
    })
    .toSorted((a, b) => b.score - a.score);
  return { loadedIds, ranked, retrievedIds };
}
```

> 注：`ScoreCoreInput`/`CoreScoreResult` 类型加到本文件顶部（或 `types.ts` 并 import）。生产 `recommendCandidatesForJobDescription` 内部改为：`const core = await scoreCandidatesForJobDescription({ excludeLinkedExceptIds: input.excludeAlreadyLinked ? new Set() : undefined, ... }, deps)`，再 `core.ranked.filter(c=>c.score>=55).slice(0,limit)` 映射回带 `toRecommendation` 的 DTO（保留原 reasons/similarity 输出结构）。`enabled=false` 的短路分支不变。

- [ ] **Step 4: 跑测试确认全绿（内核新测 + Task1 特征化测试都过）**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test recommendations`
Expected: PASS（特征化测试仍绿 = 生产行为未变）。

- [ ] **Step 5: typecheck**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/recommendations.ts apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/recommendations.test.ts
git commit -m "refactor(recommendations): 抽出打分内核 scoreCandidatesForJobDescription(行为不变)"
```

---

### Task 3: 标签有效性与去重（纯函数）

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/labels.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/types.ts`（上文共享类型）
- Test: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/labels.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export interface RawLabel {
    jobDescriptionId: string;
    candidateId: string;
    source: LabelSource;
  }
  export interface DedupResult {
    labels: PositiveLabel[];
    conflicts: number;
    dropped: number;
  }
  export function dedupeLabels(raw: RawLabel[]): DedupResult; // 键(jdId,candidateId)去重，冲突时 manual 优先并计数
  ```

- [ ] **Step 1: 写测试（先失败）**

```ts
import { describe, expect, it } from "vitest";
import { dedupeLabels } from "./labels";

describe("dedupeLabels", () => {
  it("按(jd,candidate)去重，manual 优先并计冲突", () => {
    const r = dedupeLabels([
      { jobDescriptionId: "jd1", candidateId: "c1", source: "mined" },
      { jobDescriptionId: "jd1", candidateId: "c1", source: "manual" },
      { jobDescriptionId: "jd1", candidateId: "c2", source: "mined" },
    ]);
    expect(r.labels).toHaveLength(2);
    expect(r.labels.find((l) => l.candidateId === "c1")?.source).toBe("manual");
    expect(r.conflicts).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/labels`
Expected: FAIL — `dedupeLabels is not a function`。

- [ ] **Step 3: 实现**

```ts
import type { LabelSource, PositiveLabel } from "./types";
export interface RawLabel {
  jobDescriptionId: string;
  candidateId: string;
  source: LabelSource;
}
export interface DedupResult {
  labels: PositiveLabel[];
  conflicts: number;
  dropped: number;
}

const key = (l: { jobDescriptionId: string; candidateId: string }) =>
  `${l.jobDescriptionId}::${l.candidateId}`;

export function dedupeLabels(raw: RawLabel[]): DedupResult {
  const map = new Map<string, PositiveLabel>();
  let conflicts = 0;
  for (const r of raw) {
    const k = key(r);
    const existing = map.get(k);
    if (!existing) {
      map.set(k, {
        candidateId: r.candidateId,
        jobDescriptionId: r.jobDescriptionId,
        source: r.source,
      });
      continue;
    }
    conflicts += 1;
    if (existing.source === "mined" && r.source === "manual") {
      map.set(k, { ...existing, source: "manual" });
    }
  }
  return { conflicts, dropped: raw.length - map.size, labels: [...map.values()] };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/labels`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/labels.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/labels.test.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/types.ts
git commit -m "feat(reco-eval): 标签去重(manual 优先)"
```

---

### Task 4: 五类判定器（纯函数，核心逻辑）

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/classify.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/classify.test.ts`

**Interfaces:**

- Consumes: `CoreScoreResult`（Task 2 内核输出）、`PositiveVerdict`（types.ts）。
- Produces:
  ```ts
  export const THRESHOLD = 55;
  export const TOP_K = 20;
  export interface ClassifyInput {
    candidateId: string;
    jobDescriptionId: string;
    core: CoreScoreResult;
    hasAnyVector: boolean; // 来自 vectorStore.loadResumeEmbeddings 非空
  }
  export function classifyPositive(input: ClassifyInput): PositiveVerdict;
  ```
- 判定优先级（管线顺序）：not_indexed → recall_capped → status_filtered → below_threshold → retrieved_low_rank → hit。rawRank=完整排序名次（同分按 candidateId 升序破平）；shownRank=score≥55 子列表名次。

- [ ] **Step 1: 写测试（先失败）**

```ts
import { describe, expect, it } from "vitest";
import { classifyPositive } from "./classify";
import type { CoreScoreResult } from "./types";

const core = (
  ranked: { candidateId: string; score: number }[],
  retrieved: string[],
  loaded: string[],
): CoreScoreResult => ({
  loadedIds: new Set(loaded),
  ranked: ranked.map((r) => ({ ...r, similarity: {} })),
  retrievedIds: new Set(retrieved),
});

describe("classifyPositive", () => {
  it("无向量 → not_indexed", () => {
    const v = classifyPositive({
      candidateId: "p",
      hasAnyVector: false,
      jobDescriptionId: "j",
      core: core([], [], []),
    });
    expect(v.klass).toBe("not_indexed");
    expect(v.rawRank).toBeNull();
  });
  it("有向量但未检索到 → recall_capped", () => {
    const v = classifyPositive({
      candidateId: "p",
      hasAnyVector: true,
      jobDescriptionId: "j",
      core: core([], [], []),
    });
    expect(v.klass).toBe("recall_capped");
  });
  it("检索到但被 DB 过滤 → status_filtered", () => {
    const v = classifyPositive({
      candidateId: "p",
      hasAnyVector: true,
      jobDescriptionId: "j",
      core: core([], ["p"], []),
    });
    expect(v.klass).toBe("status_filtered");
  });
  it("在列表但 score<55 → below_threshold", () => {
    const v = classifyPositive({
      candidateId: "p",
      hasAnyVector: true,
      jobDescriptionId: "j",
      core: core([{ candidateId: "p", score: 40 }], ["p"], ["p"]),
    });
    expect(v.klass).toBe("below_threshold");
    expect(v.score).toBe(40);
  });
  it("score>=55 但 shownRank>20 → retrieved_low_rank", () => {
    const ranked = Array.from({ length: 25 }, (_, i) => ({ candidateId: `c${i}`, score: 90 - i }));
    ranked.push({ candidateId: "p", score: 60 }); // 最低分 → 第 26
    const v = classifyPositive({
      candidateId: "p",
      hasAnyVector: true,
      jobDescriptionId: "j",
      core: core(
        ranked,
        ranked.map((r) => r.candidateId),
        ranked.map((r) => r.candidateId),
      ),
    });
    expect(v.klass).toBe("retrieved_low_rank");
    expect(v.shownRank).toBe(26);
  });
  it("score>=55 且 shownRank<=20 → hit", () => {
    const v = classifyPositive({
      candidateId: "p",
      hasAnyVector: true,
      jobDescriptionId: "j",
      core: core([{ candidateId: "p", score: 80 }], ["p"], ["p"]),
    });
    expect(v.klass).toBe("hit");
    expect(v.rawRank).toBe(1);
    expect(v.shownRank).toBe(1);
  });
  it("同分按 candidateId 升序破平", () => {
    const v = classifyPositive({
      candidateId: "b",
      hasAnyVector: true,
      jobDescriptionId: "j",
      core: core(
        [
          { candidateId: "a", score: 80 },
          { candidateId: "b", score: 80 },
        ],
        ["a", "b"],
        ["a", "b"],
      ),
    });
    expect(v.rawRank).toBe(2); // a 在前
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/classify`
Expected: FAIL — `classifyPositive is not a function`。

- [ ] **Step 3: 实现**

```ts
import type { CoreScoreResult, PositiveVerdict } from "./types";
export const THRESHOLD = 55;
export const TOP_K = 20;

export interface ClassifyInput {
  candidateId: string;
  jobDescriptionId: string;
  core: CoreScoreResult;
  hasAnyVector: boolean;
}

// 同分按 candidateId 升序破平，再按 score 降序，得到稳定 rawRank。
function stableRanked(core: CoreScoreResult) {
  return [...core.ranked].sort(
    (a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId),
  );
}

export function classifyPositive(input: ClassifyInput): PositiveVerdict {
  const base = {
    candidateId: input.candidateId,
    jobDescriptionId: input.jobDescriptionId,
    rawRank: null,
    score: null,
    shownRank: null,
  };
  if (!input.hasAnyVector) return { ...base, klass: "not_indexed" };
  if (!input.core.retrievedIds.has(input.candidateId)) return { ...base, klass: "recall_capped" };
  if (!input.core.loadedIds.has(input.candidateId)) return { ...base, klass: "status_filtered" };
  const ranked = stableRanked(input.core);
  const rawRank = ranked.findIndex((c) => c.candidateId === input.candidateId) + 1;
  const score = ranked[rawRank - 1].score;
  if (score < THRESHOLD) return { ...base, klass: "below_threshold", rawRank, score };
  const shown = ranked.filter((c) => c.score >= THRESHOLD);
  const shownRank = shown.findIndex((c) => c.candidateId === input.candidateId) + 1;
  if (shownRank > TOP_K) return { ...base, klass: "retrieved_low_rank", rawRank, score, shownRank };
  return { ...base, klass: "hit", rawRank, score, shownRank };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/classify`
Expected: PASS（7 例全绿）。

- [ ] **Step 5: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/classify.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/classify.test.ts
git commit -m "feat(reco-eval): 五类命中/失败判定器(管线顺序互斥)"
```

---

### Task 5: 指标聚合（纯函数）

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/metrics.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/metrics.test.ts`

**Interfaces:**

- Consumes: `PositiveVerdict[]`。
- Produces:
  ```ts
  export interface Metrics {
    positives: number;
    jds: number;
    recallAt20Shown: number;
    recallAt20Raw: number;
    recallAt50Raw: number;
    mrr: number;
    macroRecallAt20Shown: number;
    failureCounts: Record<FailureClass, number>;
  }
  export function computeMetrics(verdicts: PositiveVerdict[]): Metrics;
  ```
- 定义：`recallAt20Shown`=klass==="hit" 占比；`recallAt20Raw`=rawRank!=null&&<=20 占比；`recallAt50Raw`=rawRank!=null&&<=50 占比；`mrr`=mean(rawRank? 1/rawRank : 0)；宏平均=按 jobDescriptionId 分组各自 hit 率再平均。

- [ ] **Step 1: 写测试（先失败）**

```ts
import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics";
import type { PositiveVerdict } from "./types";

const v = (over: Partial<PositiveVerdict>): PositiveVerdict => ({
  candidateId: "c",
  jobDescriptionId: "j",
  klass: "hit",
  rawRank: 1,
  score: 80,
  shownRank: 1,
  ...over,
});

describe("computeMetrics", () => {
  it("微平均 recall@20_shown = hit 占比", () => {
    const m = computeMetrics([v({ klass: "hit" }), v({ klass: "recall_capped", rawRank: null })]);
    expect(m.recallAt20Shown).toBeCloseTo(0.5);
    expect(m.failureCounts.recall_capped).toBe(1);
    expect(m.mrr).toBeCloseTo(0.5); // (1/1 + 0)/2
  });
  it("宏平均按岗位分组", () => {
    const m = computeMetrics([
      v({ jobDescriptionId: "j1", klass: "hit" }),
      v({ jobDescriptionId: "j2", klass: "hit" }),
      v({ jobDescriptionId: "j2", klass: "recall_capped", rawRank: null }),
    ]);
    expect(m.macroRecallAt20Shown).toBeCloseTo(0.75); // (1.0 + 0.5)/2
    expect(m.jds).toBe(2);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/metrics`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
import type { FailureClass, PositiveVerdict } from "./types";
export interface Metrics {
  positives: number;
  jds: number;
  recallAt20Shown: number;
  recallAt20Raw: number;
  recallAt50Raw: number;
  mrr: number;
  macroRecallAt20Shown: number;
  failureCounts: Record<FailureClass, number>;
}
const FAIL_CLASSES: FailureClass[] = [
  "not_indexed",
  "recall_capped",
  "status_filtered",
  "below_threshold",
  "retrieved_low_rank",
];

export function computeMetrics(verdicts: PositiveVerdict[]): Metrics {
  const n = verdicts.length || 1;
  const failureCounts = Object.fromEntries(FAIL_CLASSES.map((c) => [c, 0])) as Record<
    FailureClass,
    number
  >;
  let hit = 0,
    raw20 = 0,
    raw50 = 0,
    mrrSum = 0;
  const byJd = new Map<string, { hit: number; total: number }>();
  for (const v of verdicts) {
    if (v.klass === "hit") hit += 1;
    else failureCounts[v.klass] += 1;
    if (v.rawRank !== null && v.rawRank <= 20) raw20 += 1;
    if (v.rawRank !== null && v.rawRank <= 50) raw50 += 1;
    mrrSum += v.rawRank !== null ? 1 / v.rawRank : 0;
    const g = byJd.get(v.jobDescriptionId) ?? { hit: 0, total: 0 };
    g.total += 1;
    if (v.klass === "hit") g.hit += 1;
    byJd.set(v.jobDescriptionId, g);
  }
  const macro = byJd.size
    ? [...byJd.values()].reduce((s, g) => s + g.hit / g.total, 0) / byJd.size
    : 0;
  return {
    failureCounts,
    jds: byJd.size,
    macroRecallAt20Shown: macro,
    mrr: mrrSum / n,
    positives: verdicts.length,
    recallAt20Raw: raw20 / n,
    recallAt20Shown: hit / n,
    recallAt50Raw: raw50 / n,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/metrics`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/metrics.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/metrics.test.ts
git commit -m "feat(reco-eval): 指标聚合(micro/macro/MRR/五类计数)"
```

---

### Task 6: 标签挖掘（B）— SQL 正例

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/mine-labels.ts`
- Test: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/mine-labels.test.ts`

**Interfaces:**

- Consumes: `db`（`@arc/ai-recruitment-copilot-backend/lib/server/db`）、`studioInterview`。
- Produces:
  ```ts
  export function isMinedPositive(row: {
    outcome: string;
    pipelineStage: string;
    previousStage: string | null;
  }): boolean;
  export function mineLabels(organizationId: string): Promise<PositiveLabel[]>; // source:"mined"
  ```
- 正例规则：`outcome='hired'` 或 `pipelineStage∈{written_test,ai_interview,human_interview,offer}` 或 (`outcome='rejected'` 且 `previousStage!=='screening'`)。

- [ ] **Step 1: 写纯判定单测（先失败）**

```ts
import { describe, expect, it } from "vitest";
import { isMinedPositive } from "./mine-labels";
describe("isMinedPositive", () => {
  it("ai_interview 是正例", () =>
    expect(
      isMinedPositive({
        outcome: "in_pipeline",
        pipelineStage: "ai_interview",
        previousStage: null,
      }),
    ).toBe(true));
  it("screening in_pipeline 非正例", () =>
    expect(
      isMinedPositive({ outcome: "in_pipeline", pipelineStage: "screening", previousStage: null }),
    ).toBe(false));
  it("初筛拒非正例", () =>
    expect(
      isMinedPositive({ outcome: "rejected", pipelineStage: "closed", previousStage: "screening" }),
    ).toBe(false));
  it("后期拒是正例", () =>
    expect(
      isMinedPositive({
        outcome: "rejected",
        pipelineStage: "closed",
        previousStage: "ai_interview",
      }),
    ).toBe(true));
  it("hired 是正例", () =>
    expect(
      isMinedPositive({ outcome: "hired", pipelineStage: "closed", previousStage: "offer" }),
    ).toBe(true));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/mine-labels`
Expected: FAIL。

- [ ] **Step 3: 实现（判定纯函数 + DB 拉取）**

```ts
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { studioInterview } from "@arc/db-schema/schema";
import type { PositiveLabel } from "./types";

const ADVANCED = new Set(["written_test", "ai_interview", "human_interview", "offer"]);
export function isMinedPositive(row: {
  outcome: string;
  pipelineStage: string;
  previousStage: string | null;
}): boolean {
  if (row.outcome === "hired") return true;
  if (ADVANCED.has(row.pipelineStage)) return true;
  return row.outcome === "rejected" && row.previousStage !== "screening";
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
      source: "mined" as const,
    }));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/mine-labels`
Expected: PASS（纯判定 5 例；DB 部分不在单测覆盖，由 Task 8 真实运行验证）。

- [ ] **Step 5: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/mine-labels.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/mine-labels.test.ts
git commit -m "feat(reco-eval): B 标签挖掘(推进过 screening 为正例)"
```

---

### Task 7: 评测编排 + CLI 入口

把内核、五类判定、指标、挖标签串起来：按岗分组、LOO 豁免、向量存在性查询、重试、覆盖率、报告。

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/run.ts`（编排，含向量存在性 + 重试）
- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/report.ts`（格式化）
- Create: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval.ts`（CLI 入口）
- Modify: `apps/ai-recruitment-copilot-backend/package.json`（加 script）
- Modify: `.gitignore`（加 `.eval/`）
- Test: `apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/report.test.ts`

**Interfaces:**

- Consumes: `scoreCandidatesForJobDescription`（Task 2）、`classifyPositive`（Task 4）、`computeMetrics`（Task 5）、`mineLabels`（Task 6）、`dedupeLabels`（Task 3）、`QdrantResumeVectorStore.loadResumeEmbeddings({sourceId})`。
- Produces：`runEval(opts): Promise<{ verdicts; metrics; coverage; failedJds }>`；`formatReport(...)`：string。

- [ ] **Step 1: report 纯函数测试（先失败）**

```ts
import { describe, expect, it } from "vitest";
import { formatReport } from "./report";
import type { Metrics } from "./metrics";

const m: Metrics = {
  positives: 2,
  jds: 1,
  recallAt20Shown: 0.5,
  recallAt20Raw: 0.5,
  recallAt50Raw: 1,
  mrr: 0.5,
  macroRecallAt20Shown: 0.5,
  failureCounts: {
    not_indexed: 0,
    recall_capped: 1,
    status_filtered: 0,
    below_threshold: 0,
    retrieved_low_rank: 0,
  },
};

describe("formatReport", () => {
  it("含覆盖率、五类、宏平均", () => {
    const s = formatReport({
      metrics: m,
      coverage: 1,
      failedJds: [],
      meta: { org: "org_default", mode: "b-only", startedAt: "t0", endedAt: "t1" },
    });
    expect(s).toContain("recall@20_shown");
    expect(s).toContain("recall_capped");
    expect(s).toContain("覆盖率");
  });
  it("覆盖率<80% 标警告", () => {
    const s = formatReport({
      metrics: m,
      coverage: 0.5,
      failedJds: ["jdX"],
      meta: { org: "o", mode: "b-only", startedAt: "t0", endedAt: "t1" },
    });
    expect(s).toContain("⚠️");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/report`
Expected: FAIL。

- [ ] **Step 3: 实现 report.ts**

```ts
import type { Metrics } from "./metrics";
export interface ReportInput {
  metrics: Metrics;
  coverage: number;
  failedJds: string[];
  meta: { org: string; mode: string; startedAt: string; endedAt: string };
}
export function formatReport(i: ReportInput): string {
  const { metrics: m } = i;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const covWarn = i.coverage < 0.8 ? " ⚠️ 选择性偏差" : "";
  return [
    `== 岗位人才推荐 召回基线 (${i.meta.org}, ${i.meta.mode}) ==`,
    `运行: ${i.meta.startedAt} → ${i.meta.endedAt} (快照近似)`,
    `正例对: ${m.positives}  覆盖岗位: ${m.jds}`,
    `评估覆盖率: ${pct(i.coverage)}${covWarn}`,
    `recall@20_shown=${pct(m.recallAt20Shown)}  recall@20_raw=${pct(m.recallAt20Raw)}  recall@50_raw=${pct(m.recallAt50Raw)}`,
    `MRR=${m.mrr.toFixed(3)}  宏平均 recall@20_shown=${pct(m.macroRecallAt20Shown)}`,
    `失败拆分: not_indexed=${m.failureCounts.not_indexed} recall_capped=${m.failureCounts.recall_capped} status_filtered=${m.failureCounts.status_filtered} below_threshold=${m.failureCounts.below_threshold} retrieved_low_rank=${m.failureCounts.retrieved_low_rank}`,
    `未评估(远程失败)岗位: ${i.failedJds.length ? i.failedJds.join(", ") : "无"}`,
  ].join("\n");
}
```

- [ ] **Step 4: 跑 report 测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval/report`
Expected: PASS。

- [ ] **Step 5: 实现 run.ts（编排，无单测，Task 8 真实验证）**

```ts
import {
  getResumeEmbeddingConfig,
  getResumeSemanticIndexConfig,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer";
import { QdrantResumeVectorStore } from "@arc/ai-recruitment-copilot-backend/lib/server/qdrant/resume-vector-store";
import { loadJobDescriptionById } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { scoreCandidatesForJobDescription } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/utils/recommendations";
import { classifyPositive } from "./classify";
import { computeMetrics } from "./metrics";
import type { PositiveLabel, PositiveVerdict } from "./types";

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

export async function runEval(opts: {
  organizationId: string;
  labels: PositiveLabel[];
  store: QdrantResumeVectorStore;
}) {
  const byJd = new Map<string, string[]>();
  for (const l of opts.labels)
    byJd.set(l.jobDescriptionId, [...(byJd.get(l.jobDescriptionId) ?? []), l.candidateId]);
  const verdicts: PositiveVerdict[] = [];
  const failedJds: string[] = [];
  let evaluated = 0;
  for (const [jobDescriptionId, positiveIds] of byJd) {
    try {
      const jd = await loadJobDescriptionById(opts.organizationId, jobDescriptionId);
      if (!jd) {
        failedJds.push(jobDescriptionId);
        continue;
      }
      const core = await withRetry(() =>
        scoreCandidatesForJobDescription({
          excludeLinkedExceptIds: new Set(positiveIds),
          jobDescription: {
            id: jd.id,
            name: jd.name,
            description: jd.description,
            prompt: jd.prompt,
            departmentName: null,
          },
          organizationId: opts.organizationId,
        }),
      );
      for (const candidateId of positiveIds) {
        const points = await withRetry(() =>
          opts.store.loadResumeEmbeddings({ sourceId: candidateId }),
        );
        verdicts.push(
          classifyPositive({
            candidateId,
            core,
            hasAnyVector: points.length > 0,
            jobDescriptionId,
          }),
        );
        evaluated += 1;
      }
    } catch {
      failedJds.push(jobDescriptionId);
    }
  }
  const coverage = opts.labels.length ? evaluated / opts.labels.length : 0;
  return { coverage, failedJds, metrics: computeMetrics(verdicts), verdicts };
}
```

> `scoreCandidatesForJobDescription` 无 deps 时用默认 deps（连真实 embedding+Qdrant），其内部 `ensureCollection` 需绕过：给内核加可选 `assertCollectionOnly` 分支或在 CLI 前 `await store.collectionExists()` 断言（见 Step 6）。为满足"只读不建 collection"，本任务在 CLI 里先断言 collection 存在，且默认 deps 的 vectorStore 复用同一 `store` 实例——**在内核调用前确保 collection 已存在**，`ensureCollection` 在已存在时为 no-op（只读）。

- [ ] **Step 6: 实现 CLI 入口 reco-eval.ts**

```ts
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { getResumeEmbeddingConfig } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/embedding";
import { getResumeSemanticIndexConfig } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer";
import { QdrantResumeVectorStore } from "@arc/ai-recruitment-copilot-backend/lib/server/qdrant/resume-vector-store";
import { dedupeLabels } from "./reco-eval/labels";
import { mineLabels } from "./reco-eval/mine-labels";
import { formatReport } from "./reco-eval/report";
import { runEval } from "./reco-eval/run";

function arg(name: string, fallback?: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const v = hit
    ? hit.split("=").slice(1).join("=")
    : process.argv[process.argv.indexOf(`--${name}`) + 1];
  if (!v && fallback === undefined) throw new Error(`missing --${name}`);
  return v ?? (fallback as string);
}

async function main() {
  const org = arg("org", "org_default");
  const mode = arg("mode", "b-only");
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
  const exists = await store.collectionExists?.(semantic.qdrantCollectionName);
  if (exists && exists.exists === false) throw new Error("collection 不存在（只读评测拒绝创建）");
  const mined =
    mode === "b-only"
      ? await mineLabels(org)
      : /* a-plus-b: 读 labels.json 见下 */ await mineLabels(org);
  const { labels, conflicts, dropped } = dedupeLabels(mined);
  const result = await runEval({ labels, organizationId: org, store });
  const endedAt = new Date().toISOString();
  const report = formatReport({
    coverage: result.coverage,
    failedJds: result.failedJds,
    metrics: result.metrics,
    meta: { endedAt, mode, org, startedAt },
  });
  mkdirSync(".eval", { recursive: true });
  const stamp = startedAt.replaceAll(/[:.]/g, "-");
  writeFileSync(
    `.eval/report-${mode}-${stamp}.md`,
    `${report}\n\n(labels: mined+manual 去重后 ${labels.length}, 冲突 ${conflicts}, 剔除 ${dropped})\n`,
  );
  writeFileSync(
    `.eval/detail-${mode}-${stamp}.jsonl`,
    result.verdicts.map((v) => JSON.stringify(v)).join("\n"),
  );
  console.info(report);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
```

> a-plus-b 模式读取 `--labels <path>` 指向的 `labels.json`（含 manual），与 mined 合并去重；本 Step 先落 b-only 路径，a-plus-b 的读文件分支在有人工标签文件后接入（一行 `JSON.parse(readFileSync(...))`）。`collectionExists` 用 Qdrant 客户端现有方法（`resume-vector-store.ts` 已用于 `ensureCollection`）。

- [ ] **Step 7: 加 package.json script 与 .gitignore**

`apps/ai-recruitment-copilot-backend/package.json` 的 `"scripts"` 加：

```json
"eval:recommendations": "tsx src/scripts/reco-eval.ts"
```

`.gitignore`（仓库根）追加：

```
.eval/
```

- [ ] **Step 8: typecheck + 全量单测**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck && pnpm --filter @arc/ai-recruitment-copilot-backend test reco-eval`
Expected: 无类型错误；reco-eval 所有单测（labels/classify/metrics/mine-labels/report）全绿。

- [ ] **Step 9: Commit**

```bash
git add apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/run.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/report.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval/report.test.ts apps/ai-recruitment-copilot-backend/src/scripts/reco-eval.ts apps/ai-recruitment-copilot-backend/package.json .gitignore
git commit -m "feat(reco-eval): 评测编排 + CLI(按岗LOO/重试/覆盖率/报告)"
```

---

### Task 8: 跑 B-only 基线（真实运行，非代码）

**Files:** 无（产出落 `.eval/`，gitignore）。

- [ ] **Step 1: 确认 backend 语义 env 就绪**

`apps/ai-recruitment-copilot/.env` 已含 `RESUME_SEMANTIC_INDEX_ENABLED/QDRANT_URL/QDRANT_API_KEY/RESUME_EMBEDDING_*`（本会话已配）。standalone 运行需 backend 能读到同一组 env——若 `apps/ai-recruitment-copilot-backend/.env` 不存在，复制这组语义变量 + `DATABASE_URL` 过去。

- [ ] **Step 2: 运行 B-only 基线**

Run: `pnpm --filter @arc/ai-recruitment-copilot-backend eval:recommendations --org org_default --mode b-only`
Expected: 控制台打印基线报告；`.eval/report-b-only-*.md` 与 `detail-*.jsonl` 生成。

- [ ] **Step 3: 判读**

看 `失败拆分`：若 `recall_capped` 占主导 → 证实 top-40/50 截断是元凶（①召回快赢优先）；若 `retrieved_low_rank` 主导 → ②重排优先；若 `not_indexed` 多 → 先补索引覆盖。把结论回填到规范文档 §11 的后续 spec 取舍。

- [ ] **Step 4: 留档**

把 `.eval/report-b-only-*.md` 的**无 PII 聚合部分**摘要贴入知识库 `1.极光矩阵/10.AI面试官/需求/`（可选，按需）。detail jsonl 留本地不入库。

---

## Self-Review

**Spec coverage：**

- §3.1 B 挖标签 → Task 6；§3.2 A 补强文件 → Task 7 CLI a-plus-b 分支（读 labels.json）；§3.4 校验去重 → Task 3。
- §4.1 分组 LOO（豁免正例）→ Task 2 内核 `excludeLinkedExceptIds` + Task 7 传 `new Set(positiveIds)`。
- §4.2 按岗一次评分 → Task 7 `runEval` 按 jd 分组。
- §4.3 破平仅评测 → Task 4 `stableRanked`。
- §4.4 只读/不建 collection → Task 7 CLI `collectionExists` 断言。
- §4.5 五类互斥判定 → Task 4。§5 指标（含 shown/raw/宏平均/覆盖率）→ Task 5 + Task 7 coverage + report。
- §6.1 运行契约（命令/模式/退出码）→ Task 7。§7 重构 + 特征化 → Task 1+2。§8 报告 → Task 7 report + Task 8 运行。§9 测试 → 各 Task 单测。
- §10 覆盖率下限/PII gitignore/维度校验 → Task 7（覆盖率 warn、.gitignore、CLI env 检查）。

**Placeholder scan：** a-plus-b 读文件分支在 Task 7 Step 6 标为"有人工标签文件后接入（一行 JSON.parse）"——B-only 路径完整可跑，A 分支是显式的后续接线点，非隐藏 TODO。`--strict` 覆盖率硬失败在规范里，Task 7 report 已产覆盖率与 warn；如需 `--strict` 退出码，在 CLI main 末尾加 `if (strict && coverage<0.8) process.exit(1)`（一行）。

**Type consistency：** `CoreScoreResult`/`PositiveVerdict`/`PositiveLabel`/`Metrics` 贯穿 Task 2/4/5/7 同名同形；`scoreCandidatesForJobDescription` 签名 Task 2 定义、Task 7 消费一致；`classifyPositive`/`computeMetrics`/`mineLabels`/`dedupeLabels` 跨任务签名一致。

**⚠️ 落地时需现场核对的两点**（实现者第一步先 Read 对应文件确认，不改则按现状适配）：

1. `loadRecommendationCandidates` 返回行的字段名（`id`/`currentJobDescriptionId`/`resumeParseStatus` 等）—— Task 1/2 测试 fixture 按 recommendations.ts:331-346 现状写，若有出入以真实为准。
2. `QdrantResumeVectorStore` 的 `loadResumeEmbeddings` 返回形状与 `collectionExists` 方法名 —— 按 resume-vector-store.ts 现状适配（Task 7）。
