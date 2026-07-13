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

目标岗位（`targetRoles`）已经通过 `buildResumeSemanticTexts` 进入简历向量的 `skill_role` / `resume_overview` chunk，因此推荐时**天然被隐含考虑**，本期不做额外的目标岗位字面加权。（注：DB 列名是单数 `targetRole`（`studioInterview`/`resumePoolItem` 各一列），进入语义 profile 后表现为复数列表字段 `targetRoles`——两处指同一概念的不同层，非笔误。）

## 核心设计决策

1. **JD 也进向量库**：把 JD 用与现有「JD→候选人」相同的 3 个 chunk（`buildJobRecommendationQueryTexts`）索引进**同一个 Qdrant collection** `resume_semantic_v1`，靠 payload `sourceType` 区分。推荐从此变成一次对称的向量搜索，请求时不再 embed JD，两侧向量都复用。
2. **JD 索引走独立旁路**：不改动现有简历 indexer。新增薄的 JD 语义索引模块，复用 embedding / 向量库 / `resume_semantic_index` 状态表 / queue 管道。worker 按 `sourceType` 分流——简历**业务处理路径**（`runResumeSemanticIndexJob`）不动；共享 queue schema enum 与 worker 分流点做**加法式扩展**（非"零改动"，而是"简历业务逻辑零回归"）。**无需 DB migration**：全 schema 零 `pgEnum`，`sourceType` 与 `resumePoolEvent.type` 皆为 `text().$type<...>()`，加值即 TS 联合拓宽；状态行复用 `resume_semantic_index`（`organizationId` 列、`resume_semantic_index_org_status_idx` 索引均已存在）。
3. **入口=简历详情页按需推荐**：本期不做批量视图、不做列表内联标签。
4. **动作=一键回填 `resumePoolItem.jobDescriptionId`**：新增轻量端点 `POST /:id/bind`（仅 UPDATE 该列 + 校验 JD 属组织 + 写 resumePoolEvent）。**注意**：现有 `POST /:id/import` 的 `jobDescriptionMode:"bind"` 写的是 `studioInterview.jobDescriptionId`（新建人才库记录 + review 生成 + 去重），**不碰 pool item 自身的 jobDescriptionId**，语义是"入库开筛"而非"打标签"，且不满足决策 5 的隐藏 gate；故不复用它，另建纯绑定端点（见 plan Task B5）。
5. **已绑定简历不显示推荐**：详情页 `jobDescriptionId` 非空时不展示推荐面板，也不提供重推入口。

## 复用清单（不改核心）

- Qdrant collection `resume_semantic_v1`（cosine，1024 维）与 3 个 chunk 类型（`resume_overview` / `skill_role` / `work_project`）。
- `embedResumeSemanticTexts`、`getResumeEmbeddingConfig`、`getResumeSemanticIndexConfig`。
- `buildJobRecommendationQueryTexts(jd)`（现有 JD→chunk 函数，目前是 `recommendations.ts` 私有函数，需抽到共享位置供索引旁路与打分内核共用，避免重复）。
- `QdrantResumeVectorStore`：`loadResumeEmbeddings` / `searchSimilarResumes`（`sourceTypes` 过滤）/ `deleteResumeEmbeddings` / `upsertResumeEmbeddings` 均已具备。point id 以 `sourceType:sourceId:chunkType:embeddingVersion` 派生，跨类天然命名空间隔离；upsert/delete 均按 `sourceType`+`sourceId` 双重限定，不会误伤另一类向量。
- `resume_semantic_index` 状态表与 `upsertResumeSemanticIndexState` upsert helper。唯一键为 `(sourceType, sourceId, embeddingVersion)`，已含 `sourceType`，JD 与简历同 ID 也不冲突，复用该表安全。该表已有 `organizationId`（notNull，onDelete cascade）与 `resume_semantic_index_org_status_idx`(organizationId, status) / `resume_semantic_index_org_source_idx` 索引，故 `indexing(b)` 判定与组织隔离直接落在既有列/索引上，**无需加列或建索引**。
- 打分权重：`skillRole*0.45 + workProject*0.35 + resumeOverview*0.2`，×100 floored；阈值 55（facet 字段名 `skillRole`/`workProject`/`resumeOverview` 对应 chunk 类型 `skill_role`/`work_project`/`resume_overview`）。
- 队列 `resume-semantic-index`（queue/worker/入队去重）。
- `loadResumePoolItem` DAO + `writeResumePoolEvent`（新绑定端点复用它们回填 `resumePoolItem.jobDescriptionId`）。

## 数据流

### 索引时（JD 变更触发）

```
JD 建/改 → buildJobRecommendationQueryTexts(jd) → 3 chunk
        → embedResumeSemanticTexts → upsert 进 Qdrant(sourceType=job_description)
        → 记 resume_semantic_index(sourceType=job_description)
JD 删   → deleteResumeEmbeddings(job_description, id) + 删状态行
```

- 变更检测：按 JD 内容 hash（`name` + `departmentName` + `description` + `prompt`——凡进入语义向量的字段都要覆盖；`departmentName` 进了 `resume_overview` chunk，故必须纳入，否则改部门不会触发重索引），内容未变则跳过（镜像简历 `profileHash` 的语义）。hash 只覆盖影响**语义向量**的字段；组织归属、删除与否等"是否可推荐"维度不进 hash，改由查询时的组织隔离（召回）+ 存在性兜底（DB join）实时裁决，无需重索引。**hash 字段须与 `buildJobRecommendationQueryTexts` 的实际输入全集保持一致**（当前即 `name`/`departmentName`/`description`/`prompt`）；为防二者漂移（改了 chunk 构造器却漏改 hash → 改内容不重索引），加一条一致性测试：断言 hash 消费的字段集 ⊇ 构造器消费的字段集。
- 入队为 best-effort：Redis/队列未配置或语义索引未启用时静默跳过，不阻断 JD 的 CRUD。

### 查询时（详情页点「推荐岗位」）

```
1. loadResumeEmbeddings(poolItem)  # 取该简历已存的 3 个向量（真复用）
   └─ 若未索引 → 回退：buildResumeSemanticTexts(profile) 现场 embed（带超时，见「边界与失效」）
2. 每 chunk：searchSimilarResumes({ chunkType, embedding,
     sourceTypes:["job_description"], organizationId, limit: SEARCH_LIMIT_BY_CHUNK[chunkType] })
   # 组织隔离在【召回时】完成：searchSimilarResumes 已对 payload organizationId 做 must 过滤
   #（resume-vector-store.ts:221），候选集只含本组织 JD，不会被他组织向量挤占 top-K
   # 每 chunk 检索上限复用现有 SEARCH_LIMIT_BY_CHUNK（40/50/50），与 JD→候选人内核一致；
   # 均显著大于最终 topN（默认 10），保召回后再由阈值/topN 收敛
3. 按 JD sourceId 合并 facet 分 → 加权 → 阈值(≥55) 初筛 → 排序：分数降序，**同分按 JD id 升序**作确定性次序（不依赖 Qdrant/DB 返回顺序，`toSorted((a,b)=>b.score-a.score || a.id.localeCompare(b.id))`，避免列表抖动/测试不可复现）
4. 存在性兜底（DB 侧）：拉展示字段时 join `job_description`，已被硬删除的 JD 行不存在 → 自然掉出
   # job_description 无"招聘状态"列（硬删除模型），"可推荐" ≡ "DB 行还在"；无需额外状态过滤
5. **硬约束：存在性 join 在 Top-N 截断之前**——对**全部**过阈值 JD id 批量 join DB、剔除已删行，**之后**才 `slice(0, topN)`；不可先取 topN 个再 join，否则已删 JD 占位会让返回数少于 topN → 展示字段（name/departmentName/description）+ 生成匹配理由（规则模板）
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
  - body：`{ topN?: number }`（最终返回条数，默认 10；每 chunk 检索上限由内核内部用现有 `SEARCH_LIMIT_BY_CHUNK` 常量，不暴露给调用方）。
  - 组织隔离：从请求上下文取 org，作为 `searchSimilarResumes` 的 `organizationId` 过滤参数传入（召回时限定，见数据流第 2 步），不依赖召回后再裁剪。
  - 删除兜底：`job_description` 硬删除模型、无招聘状态列，展示 join 时行不存在即掉出（数据流第 4 步）；无需状态过滤。
  - 已绑定（`jobDescriptionId` 非空）：**确定返回** `{ status:"already_matched", recommendations:[] }`（唯一契约，不用"空结果 or already_matched"二义），前端据此不显示面板（服务端幂等防御，即使前端不触发也成立）。
  - 权限：`requirePermission("resumePool","read")` + `requirePermission("jd","read")`（入口与数据对象是 resume-pool 详情页的 pool item，故用 `resumePool` 而非 `resumeLibrary`）。
- 一键回填（新端点，选项 A）：`POST /:id/bind`，body `{ jobDescriptionId }`。校验 JD 属当前组织且存在（照抄 import handler 的 JD 校验），UPDATE `resumePoolItem.jobDescriptionId` + 写 `resumePoolEvent`。**事务边界**：JD 存在/属组织校验、条件 UPDATE（`WHERE jobDescriptionId IS NULL` 兜底 bind-once，命中 0 行→409）、`resumePoolEvent` 写入须在**同一事务**内，避免"已绑定但事件缺失"或"校验通过后 JD 被并发删除"的竞态。权限 `requirePermission("resumePool","import")` + `requirePermission("jd","read")`。与 import（入库开筛）解耦。

### 打分内核

- `studio/routes/resume-pool/utils/jd-recommendations.ts`：
  - `scoreJobDescriptionsForResume(input, deps?)`：镜像 `scoreCandidatesForJobDescription`，复用权重与 `mergeVectorScores` 思路，但检索方向为 `sourceTypes:["job_description"]`、加载对象为 JD 展示行。
  - `recommendJobDescriptionsForResume(input, deps?)`：顶层入口，检索传 `organizationId`（召回隔离）+ 阈值过滤 + DB 存在性 join（掉已删除）+ `topN` 截断 + disabled 短路（镜像 `recommendCandidatesForJobDescription`）。
  - 匹配理由 `buildReasons`：facet 命中话术（如「技能与岗位要求相似」「职责/项目经验匹配」「整体画像匹配」），JD 导向。

### Shared DTO

- `@arc/shared/job-descriptions`（或新增模块）：`JobDescriptionRecommendation`（`id` / `name` / `departmentName` / `score` / `similarity` / `reasons` / `description` 摘要）与 `JobDescriptionRecommendationResult`（`status: "disabled" | "ready" | "already_matched" | "indexing"`、`diagnostics.{vectorHitCount, filteredByThreshold}`），与现有 `JobDescriptionTalentRecommendationResult` 对称。（不含 `filteredByRange`：组织隔离在召回时完成、删除兜底靠 DB join 自然掉出，均无"被范围过滤计数"这一步。）诊断字段用于前端区分"无合适岗位"（hit>0 但全被阈值过滤）、"暂无命中"与"索引未完成"。`indexing` 仅表示**无法即时给出结果**的两种情况：(a) 现场 embed 超时/失败（已排队后台补索引）；(b) 本组织 JD 尚未回填进向量库——**检测方法**：`select count(*) from resume_semantic_index where organizationId=? and sourceType='job_description' and status='indexed'`（走 `resume_semantic_index_org_status_idx`）；当计数为 0 且向量检索 0 命中时判为 `indexing(b)`，与"确实无匹配岗位"（计数>0 但 0 命中→`ready` 空）区分开。现场 embed **成功**、且本组织已有 JD 向量时，直接走正常检索、返回 `ready` + 结果，不进 `indexing`。
- 日期/字符串跨线遵循现有约定。

### 前端

- `components/features/studio/resume-pool/resume-pool-details.tsx`：
  - `jobDescriptionId` 为空时展示「推荐岗位」面板/按钮；非空时不展示。
  - 点击 → 经 `rpc` + `rpcFetch` 调 `POST /:id/recommendations`，展示 Top-N JD 卡片（分数 + 匹配理由 + 部门）。
  - 每张卡「匹配到此岗位」→ 调 `POST /:id/bind` 回填 `resumePoolItem.jobDescriptionId` → mutation 成功后失效相关 query、等详情刷新、面板收起（`enabled:!bound` 自动收）；mutation pending 时禁用按钮防重复点击，失败给 toast。
  - `status:"disabled"` → 灰态提示（语义索引未启用）；`status:"indexing"` → "岗位/简历索引处理中，稍后重试"；`ready` 但结果空 → 依 `diagnostics` 区分"暂无合适岗位"与"暂无命中"。

### 存量回填

- 新脚本 `scripts/backfill-jd-semantic-index.ts`（仿 `backfill-resume-semantic-index.ts`）：按组织把现有 JD 入队索引。

## 边界与失效

- **未启用语义索引**：`isResumeSemanticIndexEnabled()` + qdrant/embedding 配置门槛任一不满足 → 端点 `status:"disabled"`，前端灰态。
- **简历未索引**：查询时回退现场 embed，**带固定超时 `JD_REC_EMBED_TIMEOUT_MS = 3000`（3s，常量、本期不做可配）**——外部 embedding 服务超时/限流时不硬等，超时即入队后台补索引（`enqueueResumeSemanticIndexJobBestEffort` sourceType=resume_pool_item）。**出口态收敛**：仅当入队确实落队才返回 `status:"indexing"`；若队列未配置/不可达导致 best-effort 入队为 no-op，则返回 `status:"disabled"`（前端灰态，比无限 spinner 诚实）并打结构化日志——否则用户会永远卡 `indexing` 重试无果（无出口态）。既不拖垮详情页接口，也不制造死循环。
- **JD 改了未及时重索引**：内容 hash + 入队；worker 消费前短暂沿用旧向量（可接受）。
- **已绑定简历**：不显示推荐、无重推入口（决策 5）。
- **JD 删除**：删除时 best-effort 删向量 + 状态行（清理，减少召回浪费）；但"不推荐已删岗位"的**正确性由查询时 DB 存在性 join 保证**（数据流第 4 步），不依赖向量删除成功，故删除失败被静默跳过也安全。
- **best-effort 入队失败的可观测性**：JD 建/改后入队索引若因 Redis 未配置/入队异常静默跳过，该 JD 会长期无向量、推荐里始终不出现。入队失败需打结构化日志（含 jdId + 原因），并可经 backfill 脚本补齐，避免"查无此岗"难以定位。

## 测试

- 打分内核单测（仿 `recommendations.test.ts`）：facet 合并、加权、阈值、Top-N 稳定序、绑定短路、disabled 短路、**组织隔离**（检索传 `organizationId`、他组织 JD 不进候选）、**存在性兜底**（已删 JD 即使向量命中也因 DB join 掉出）。
- JD indexer 单测（仿 `indexer.test.ts`）：内容 hash 跳过、upsert/删除、source 缺失跳过、失败标记。
- 查询回退单测：简历未索引 → 走现场 embed；embed 超时 → 返回 `status:"indexing"` 不抛。

## 明确不做（YAGNI）

- 未匹配简历的批量视图、列表内联推荐标签。
- 反向（简历→JD）评测 harness（后续可仿 reco-eval 补）。
- JD 侧独立权重调参、目标岗位字面加权。
- 重推/换岗位入口（已绑定简历不展示推荐）。服务端以 `POST /:id/bind` **条件更新 `jobDescriptionId IS NULL` 兜底 bind-once**：对已绑定的 pool item 再次 bind 返回 **409**（并发双写先到者赢）。
- 误绑后的解绑/换绑闭环（纠错）：本期不做；如需纠错走既有 pool item 编辑或人工，后续可加独立端点。

## 未决 / 待实现时确认

- worker 分流的确切装配位置（backend 注入 processor 处）需在实现时定位。
- **实现默认值已定**（DTO/测试/前端按此固化，非"待确认"）：Top-N 默认 `topN=10`、阈值 `>=55`（沿用 JD→候选人内核）。上线后可按实测调，但属独立调参工作、不阻塞本期实现。
