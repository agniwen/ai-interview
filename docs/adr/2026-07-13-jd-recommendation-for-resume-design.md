# 无编码岗位推荐（简历 → Top-N JD）设计

> 日期：2026-07-13 · 状态：待评审

## 背景与目标

人才库里有大量简历导入后**没有匹配到具体岗位**（`resume_pool_item.jobDescriptionId` 为空，即用户口中的「无编码/无 JD 编码」）。HR 需要系统给出「这份简历最适合哪些在招岗位」的建议，快速决策并落地匹配。

本功能是现有「JD → 候选人」推荐的**反向**：输入一份未匹配简历，输出 Top-N 个最合适的 JD（岗位），并支持一键把简历绑定到选中的岗位。

### 与「目标岗位」的关系（概念边界）

| 概念               | 数据                                            | 含义                                              | 角色                         |
| ------------------ | ----------------------------------------------- | ------------------------------------------------- | ---------------------------- |
| 目标岗位           | `resume_pool_item.targetRole`（自由文本）       | 候选人自己简历里的意向岗位，组织未必有对应真实 JD | 输入信号（已隐含进简历向量） |
| 推荐岗位（本功能） | 组织里真实存在的 JD 实体                        | 系统按语义匹配度排出的 Top-N 真实岗位             | 输出/建议                    |
| 匹配绑定           | `resume_pool_item.jobDescriptionId`（FK，可空） | 简历真正落到某个 JD 上；为空 = 未匹配             | 最终动作                     |

目标岗位（`targetRoles`）已经通过 `buildResumeSemanticTexts` 进入简历向量的 `skill_role` / `resume_overview` chunk，因此推荐时**天然被隐含考虑**，本期不做额外的目标岗位字面加权。

## 核心设计决策

1. **JD 也进向量库**：把 JD 用与现有「JD→候选人」相同的 3 个 chunk（`buildJobRecommendationQueryTexts`）索引进**同一个 Qdrant collection** `resume_semantic_v1`，靠 payload `sourceType` 区分。推荐从此变成一次对称的向量搜索，请求时不再 embed JD，两侧向量都复用。
2. **JD 索引走独立旁路**：不改动现有简历 indexer。新增薄的 JD 语义索引模块，复用 embedding / 向量库 / `resume_semantic_index` 状态表 / queue 管道。worker 按 `sourceType` 分流，**简历索引路径零改动**。
3. **入口=简历详情页按需推荐**：本期不做批量视图、不做列表内联标签。
4. **动作=一键回填 `jobDescriptionId`**：复用现有人才库更新端点（`jobDescriptionMode:"bind"`），不新写绑定逻辑。
5. **已绑定简历不显示推荐**：详情页 `jobDescriptionId` 非空时不展示推荐面板，也不提供重推入口。

## 复用清单（不改核心）

- Qdrant collection `resume_semantic_v1`（cosine，1024 维）与 3 个 chunk 类型（`resume_overview` / `skill_role` / `work_project`）。
- `embedResumeSemanticTexts`、`getResumeEmbeddingConfig`、`getResumeSemanticIndexConfig`。
- `buildJobRecommendationQueryTexts(jd)`（现有 JD→chunk 函数，目前是 `recommendations.ts` 私有函数，需抽到共享位置供索引旁路与打分内核共用，避免重复）。
- `QdrantResumeVectorStore`：`loadResumeEmbeddings` / `searchSimilarResumes`（`sourceTypes` 过滤）/ `deleteResumeEmbeddings` / `upsertResumeEmbeddings` 均已具备。
- `resume_semantic_index` 状态表与 `upsertResumeSemanticIndexState` upsert helper。
- 打分权重：`skillRole*0.45 + workProject*0.35 + resumeOverview*0.2`，×100 floored；阈值 55。
- 队列 `resume-semantic-index`（queue/worker/入队去重）。
- 人才库绑定端点（`jobDescriptionMode:"bind"` + `jobDescriptionId`）。

## 数据流

### 索引时（JD 变更触发）

```
JD 建/改 → buildJobRecommendationQueryTexts(jd) → 3 chunk
        → embedResumeSemanticTexts → upsert 进 Qdrant(sourceType=job_description)
        → 记 resume_semantic_index(sourceType=job_description)
JD 删   → deleteResumeEmbeddings(job_description, id) + 删状态行
```

- 变更检测：按 JD 内容 hash（`name` + `description` + `prompt`），内容未变则跳过（镜像简历 `profileHash` 的语义）。
- 入队为 best-effort：Redis/队列未配置或语义索引未启用时静默跳过，不阻断 JD 的 CRUD。

### 查询时（详情页点「推荐岗位」）

```
1. loadResumeEmbeddings(poolItem)  # 取该简历已存的 3 个向量（真复用）
   └─ 若未索引 → 回退：buildResumeSemanticTexts(profile) 现场 embed
2. 每 chunk：searchSimilarResumes({ chunkType, embedding, sourceTypes:["job_description"], limit })
3. 按 JD sourceId 合并 facet 分 → 加权 → 阈值(≥55) + Top-N
4. 拉 Top-N JD 展示字段（name/departmentName/description）+ 生成匹配理由
```

## 组件清单（按层）

### 队列 / schema

- `packages/resume-parse-queue/src/resume-semantic-index.ts`：`resumeSemanticIndexJobSchema.sourceType` enum 加 `"job_description"`。
- worker `processJob`：按 `sourceType` 分流——`job_description` → JD indexer；其余 → 现有 `runResumeSemanticIndexJob`（简历路径不动）。分流点在 worker 装配处（backend 侧注入 processor 的地方）。

### 后端 lib

- `lib/server/resume-semantic/vector-store.ts`：`ResumeSemanticSourceType` 加 `"job_description"`。
- 新 `lib/server/jd-semantic/`：
  - `indexer.ts`：加载 JD → `buildJobRecommendationQueryTexts` → embed → `upsertResumeEmbeddings(sourceType=job_description)` → 复用 `upsertResumeSemanticIndexState` 标记状态；含内容 hash 跳过与失败标记。
  - `enqueue.ts`：`enqueueJdSemanticIndexJobBestEffort`（仿 `enqueueResumeSemanticIndexJobBestEffort`）。
  - `hash.ts`：`hashJobDescriptionForSemanticIndex(jd)`。

### 后端 route

- JD 索引钩子（`studio/routes/job-descriptions/route.ts`）：
  - `.post`（建，line ~269）、`.patch`（改，line ~429）成功后 best-effort 入队 JD 索引。
  - `.delete("/:id")`（line ~516）成功后删 JD 向量 + 状态行（best-effort）。
- 推荐端点（新，路径下沉）：`studio/routes/resume-pool/routes/recommendations/route.ts`，`POST /:id/recommendations`。
  - body：`{ limit?: number }`（默认 Top-N，如 10）。
  - 已绑定（`jobDescriptionId` 非空）：返回空结果或 `status:"already_matched"`，前端据此不显示面板。
  - 权限：`requirePermission("resumeLibrary","read")` + `requirePermission("jd","read")`。
- 一键回填：复用现有 pool-item 更新端点（`jobDescriptionMode:"bind"` + `jobDescriptionId`），不新增端点。

### 打分内核

- `studio/routes/resume-pool/utils/jd-recommendations.ts`：
  - `scoreJobDescriptionsForResume(input, deps?)`：镜像 `scoreCandidatesForJobDescription`，复用权重与 `mergeVectorScores` 思路，但检索方向为 `sourceTypes:["job_description"]`、加载对象为 JD 展示行。
  - `recommendJobDescriptionsForResume(input, deps?)`：顶层入口，阈值过滤 + `limit` 截断 + disabled 短路（镜像 `recommendCandidatesForJobDescription`）。
  - 匹配理由 `buildReasons`：facet 命中话术（如「技能与岗位要求相似」「职责/项目经验匹配」「整体画像匹配」），JD 导向。

### Shared DTO

- `@arc/shared/job-descriptions`（或新增模块）：`JobDescriptionRecommendation`（`id` / `name` / `departmentName` / `score` / `similarity` / `reasons` / `description` 摘要）与 `JobDescriptionRecommendationResult`（`status: "disabled" | "ready" | "already_matched"`、`diagnostics.vectorHitCount`），与现有 `JobDescriptionTalentRecommendationResult` 对称。
- 日期/字符串跨线遵循现有约定。

### 前端

- `components/features/studio/resume-pool/resume-pool-details.tsx`：
  - `jobDescriptionId` 为空时展示「推荐岗位」面板/按钮；非空时不展示。
  - 点击 → 经 `rpc` + `rpcFetch` 调 `POST /:id/recommendations`，展示 Top-N JD 卡片（分数 + 匹配理由 + 部门）。
  - 每张卡「匹配到此岗位」→ 调现有更新端点回填 `jobDescriptionId` → 失效相关 query、刷新详情、面板收起。
  - `status:"disabled"` → 灰态提示（语义索引未启用）。

### 存量回填

- 新脚本 `scripts/backfill-jd-semantic-index.ts`（仿 `backfill-resume-semantic-index.ts`）：按组织把现有 JD 入队索引。

## 边界与失效

- **未启用语义索引**：`isResumeSemanticIndexEnabled()` + qdrant/embedding 配置门槛任一不满足 → 端点 `status:"disabled"`，前端灰态。
- **简历未索引**：查询时回退现场 embed，不阻断。
- **JD 改了未及时重索引**：内容 hash + 入队；worker 消费前短暂沿用旧向量（可接受）。
- **已绑定简历**：不显示推荐、无重推入口（决策 5）。
- **JD 删除**：删向量 + 状态行，避免推荐到已删岗位。

## 测试

- 打分内核单测（仿 `recommendations.test.ts`）：facet 合并、加权、阈值、Top-N 稳定序、绑定短路、disabled 短路。
- JD indexer 单测（仿 `indexer.test.ts`）：内容 hash 跳过、upsert/删除、source 缺失跳过、失败标记。
- 查询回退单测：简历未索引 → 走现场 embed。

## 明确不做（YAGNI）

- 未匹配简历的批量视图、列表内联推荐标签。
- 反向（简历→JD）评测 harness（后续可仿 reco-eval 补）。
- JD 侧独立权重调参、目标岗位字面加权。
- 重推/换岗位入口（已绑定简历不展示推荐）。

## 未决 / 待实现时确认

- worker 分流的确切装配位置（backend 注入 processor 处）需在实现时定位。
- Top-N 的 N 默认值（暂定 10）与阈值是否沿用 55，可在实现时按实测调。
