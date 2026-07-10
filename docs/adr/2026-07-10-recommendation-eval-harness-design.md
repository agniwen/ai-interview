# 岗位人才推荐 — 评测集与基线度量 设计

> 日期：2026-07-10（v2，含 codex 外部审查修订）
> 状态：设计已确认，待评审
> 背景文档（知识库）：`1.极光矩阵/10.AI面试官/技术架构/岗位人才推荐-语义匹配与排序逻辑.md`、`需求/岗位人才推荐-优点缺点与优化建议.md`
> v2 修订要点：命中判定对齐生产阈值 / P 缺席逐因诊断(不再一概 truncated) / 真 leave-one-out(只放回正例) / 按岗位一次评分 / 只读与 ensureCollection 调和 / 重构加特征化测试。

## 1. 背景与目标

现有岗位人才推荐是"语义召回 + 分面加权"的 MVP（打分逻辑见 `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/recommendations.ts`）。招聘方首要痛点是**召回**："本该被推荐的人没出现或排得很后"（症状优先级：召回 > 排序可信 > 误报）。库规模约**几千份/组织**，当前每分面召回上限仅 top 40/50，怀疑是**静默截断**导致漏人。

优化前必须先有**尺子**：一个量化"好候选人有没有被召回"的评测器，并跑出**当前基线**。没有它，调权重/放上限都是盲调。

**本 spec 只交付评测集 + 基线度量。** 召回优化与重排是后续独立 spec。

## 2. 范围

**做：** 标签挖掘(B) + 轻量人工补强(A)；**leave-one-out 召回评测器**；基线报告(recall@20/50、MRR，含**失败逐因拆分**)；一处支撑性重构(抽"打分内核")。

**交付顺序（明确）：** 先出 **B-only 基线**，A 补强后再出 **A+B 基线**；两份都留档。

**不做（后续 spec）：** 召回上限放开 / 混合检索 / JD embedding 缓存(①)；重排(②)；硬过滤、可学习打分、分数校准、埋点训练闭环。

**负例：** 本轮召回度量主要靠正例，负例可选。当前已知有 8 个干净的初筛拒可作负例（见 §3.3），但不作为本轮必交付。

**约束：只读。** 不改数据库、不改 Qdrant 数据（含不触发 collection 创建，见 §4.4）。

## 3. 标签来源

信号模型（`packages/db-schema/src/studio-interviews.ts`）：`pipelineStage`(screening→written_test→ai_interview→human_interview→offer→closed) + `outcome`(in_pipeline/hired/rejected/withdrawn/archived)。结案阶段记于 `closed_meta->>'previousStage'`。

### 3.1 方案 B（历史信号，种子）

**正例规则**（"简历是好匹配"以"招聘方把他往下推"为代理）：某 `studio_interview` 行满足下列任一，则 `(job_description_id, id)` 记为该岗位一个正例：

- `outcome='hired'`；或
- `pipeline_stage ∈ {written_test, ai_interview, human_interview, offer}`；或
- `outcome='rejected'` 且 `closed_meta->>'previousStage' ∉ {screening}`（**后期才拒 = 简历本身合格，算正例**）。

**排除**：screening 且 in_pipeline（未判）、withdrawn（自撤）、`outcome='archived'`。

**当前产量（org_default，只读实测 2026-07-10）**：1101 份、1076 绑岗、50 岗。正例 ≈ **49**（ai_interview 45 + human_interview 2 + offer 2），覆盖约 **20 岗**；hired 0；后期拒 0（规则备将来）。正例的 legacy `status` 均非 archived（**被 §4.5 状态过滤误伤者：0**）。→ 薄但可用。

### 3.2 方案 A（人工补强）

**选岗规则（确定、可复现）**：按 mined 正例数降序取 **Top-15 岗位**，同数按 `job_description_id` 升序破平。对每个选中岗位导出"现有候选人(姓名+id)"清单，招聘方勾"本该被推荐"，并入标签集。**完成标准**：每个选中岗位标签数 ≥3。

A 补强为**第二步**：评测器先跑 B-only 出基线，A 后重跑。

### 3.3 负例（可选，不阻塞）

已知 8 个 `outcome='rejected'` 且 `previousStage='screening'`（初筛拒），是干净硬负例，覆盖 5 岗。若做精准度/误报度量可用；本轮召回基线不依赖。

### 3.4 标签存储与校验

标签文件 `labels.json`：`{ jobDescriptionId, candidateId, label: "positive", source: "mined" | "manual" }[]`。

- **去重键** `(jobDescriptionId, candidateId)`；同键 `source` 冲突时 **manual 优先**并记一次告警。
- **有效性校验**（载入即查，无效者剔除并计数报告）：org 归属正确、jd 与 candidate 均存在、candidate 属该 org、`resumeParseStatus='ready'`。
- 文件路径见 §6；**含 PII，不入版本库**（gitignore）。

## 4. 评测方法论

### 4.1 真 leave-one-out（修订）

正例都是"已绑定且推进过"的人，推荐默认 `excludeAlreadyLinked:true` 会排除他们。关键：**绑定关系只影响"排除已绑定"过滤与展示字段，不参与打分**（打分纯向量相似度），故**无需改库**。

反事实场景应是"**P 尚未绑定、其余过滤保持生产一致**"。因此评测的候选集合 =

```
(该 org 全部 studio_interview  MINUS  绑定到岗位 J 的候选人)  UNION  {该岗位被评测的正例们}
```

即：**其他已绑定候选人仍按生产排除**（不能把他们塞回来跟正例抢排名 → 否则低估召回），**只放回被评测的正例**。实现上在候选载入的过滤处，对"绑定到 J"的排除集**豁免正例 id**即可，仍只读。

### 4.2 按岗位一次评分（修订）

**按岗位分组**：同一岗位的多个正例，**JD 只 embedding 一次、只跑一次检索+排序**，在同一排序列表里定位该岗所有正例。避免逐(J,P)重复 embedding/查询、避免同岗正例基于不同检索结果。

- 代价说明：同岗多个正例会彼此竞争排名（相对严格单-P LOO 略微互相压低）。本轮取"按岗批量"以控成本与超时，并在报告标注该近似。

### 4.3 排名与命中定位

对岗位 J 跑**打分内核**（§7），得到候选**排序列表**（是三分面 top-40/50 检索结果的**并集排序**，非全组织排序——措辞据实）。对每个正例 P 定位其位置，产出下节的命中/失败判定。**同分稳定排序**：分数 `Math.floor` 后按 `candidateId` 升序破平，保证跨运行可复现。

### 4.4 只读与 ensureCollection（修订）

推荐路径的 `vectorStore.ensureCollection()` 会在缺失时**创建 collection/索引（写操作）**。评测器**不调用 ensureCollection**，改为**断言 collection 已存在**（不存在则直接报错退出，不创建）。保证"全程只读"成立。

### 4.5 P 缺席的逐因诊断（修订，核心）

P 不在排序列表 **不等于** 被召回上限截断。载入/检索前后对每个缺席正例逐项判定，归入**唯一**失败类别：

1. **not_indexed**：P 在 Qdrant 无对应 active 向量（三分面均无）。
2. **status_filtered**：P 被 `loadRecommendationCandidates` 的 `status='archived'` 过滤（当前实测 0 例，仍保留该类）。
3. **recall_capped**：P 有 active 向量，但三分面均未进各自 top-40/50 → **真·召回上限截断**。
4. **below_threshold**：P 进了排序，但 `score < 55`（生产会被阈值挡掉，UI 不展示）。
5. **retrieved_low_rank**：P 进了排序、`score ≥ 55`，但 `rank > 20`。

诊断需要能查"P 是否有 active 向量"（读 Qdrant/索引表）与"P 是否过 DB 过滤"。该拆分**直接支撑"放开上限(治 3) vs 改打分/重排(治 5) vs 改阈值(治 4)"的决策**。

## 5. 指标

命中判定**对齐生产展示**（生产 = 先 `score≥55` 过滤、再取 top-20）：

- **recall@20_shown**（主指标）：`score ≥ 55` 且 `rank ≤ 20` 的正例占比 = 实际会展示的召回。
- **recall@20_raw**：仅 `rank ≤ 20`（不看阈值）。二者差 = **55 阈值卡掉的量**。
- **recall@50_raw**：`rank ≤ 50`。
- **MRR**：`mean(1/rank)`，缺席记 0。
- **失败拆分**（§4.5 五类计数）——报告核心。
- **微平均 + 宏平均**：既报正例对微平均，也报**按岗位宏平均**（避免正例多的岗主导）；标注每岗样本量，薄样本结论保守。（置信区间本轮不做。）

## 6. 组件与数据流

```
mineLabels(org) ─┐
A 勾选文件 ───────┼► loadLabels()+校验 ► group by JD ► 对每岗: scoreCore(J, LOO豁免正例)
                 │                                        ► 定位正例/缺席诊断
                 └──────────────────────────────────────► aggregate ► report
```

1. **`mineLabels(organizationId)`**（§3.1，只读）产 mined 正例。
2. **`loadLabels()`**：合并 mined+manual、去重、有效性校验（§3.4）。
3. **打分内核 `scoreCandidatesForJobDescription`（§7 重构）**：返回完整排序（每人 score + 三分面相似度），支持"排除绑定 J 但豁免指定正例 id"参数。
4. **缺席诊断器**：查 P 的 active 向量与 DB 过滤态，归入 §4.5 五类。
5. **`evalRecall(labels)`**：按岗分组评分、定位、聚合 §5 指标。
6. **`report(result)`**：输出基线报告（§8）。**标签/导出文件路径**：`apps/ai-recruitment-copilot-backend/.eval/`（gitignore）；入库版本只留无 PII 的聚合报告。

**远程健壮性**：每岗 embedding + Qdrant 查询带**重试 3 次 + 指数退避**；某岗最终失败则**该岗正例整体排除出指标、单列"未评估"清单**（绝不静默改变分母）。

## 7. 支撑性重构

现有 `recommendCandidatesForJobDescription`（recommendations.ts:230）把"召回→合并→加权→排序"与 `excludeAlreadyLinked` 过滤、`score>=55` 过滤、`slice(0,limit)` 截断、DTO 组装揉在一起。

**抽出打分内核** `scoreCandidatesForJobDescription`：返回**完整排序列表**（含 score + 三分面），并把"绑定排除"做成可传参（支持豁免正例 id 供评测用）。

- 生产函数 = 内核（excludeAlreadyLinked=真、无豁免）+ 55 阈值 + top-20 截断 + DTO，**行为不变**。

**等价保障（修订）**：重构前先补**特征化测试**锁死生产行为，覆盖：55 阈值边界、limit 截断、排序、**同分破平**、`excludeAlreadyLinked` 两种取值、三分面 top-40/50 召回上限。现有 `recommendations.test.ts` 覆盖不足，需补齐后再抽内核。

## 8. 产出

```
== 岗位人才推荐 召回基线 (org_default) ==
运行元数据: git=<sha> 标签文件哈希=<hash> embedding=<model@ver> collection=<name>
            召回参数=[40/50/50] 阈值=55 topK=20 标签: mined=NN manual=MM 无效剔除=KK
正例对: 49  覆盖岗位: 20
recall@20_shown = 0.XX   recall@20_raw = 0.XX(阈值卡掉 = raw-shown)
recall@50_raw = 0.XX     MRR = 0.XX     宏平均 recall@20_shown = 0.XX
缺席拆分: not_indexed A / status_filtered B / recall_capped C / below_threshold D
[按岗位表: jd | 正例 | @20命中 | 各失败类计数 | 样本量]
未评估(远程失败)岗位: [...]
```

## 9. 测试

- **特征化测试**（§7）：先于重构，锁生产行为等价。
- **评测器单测（合成小数据集）**：内存 mock 内核 + 缺席诊断，验证：应进 top-K 必命中；`score<55` 判 below_threshold；无向量判 not_indexed；均未进 top-K 判 recall_capped；rank>20 判 retrieved_low_rank；recall/MRR/宏平均计算与破平正确。vitest，不连外部。
- **真实基线运行**：连生产库 + Qdrant + embedding，产 §8 报告（一次性分析运行，非 CI）。

## 10. 风险与开放项

- **标签薄**：~49 正例/20 岗，噪声大。缓解：A 补强至每岗 ≥3；报告标样本量、结论保守。
- **漏斗数据浅**：95% 简历卡 screening 未判，正例天花板受历史处理量限，随使用变厚。
- **时间漂移**：历史标签对应的 JD 文案/简历内容/索引版本可能已变；报告记录 embedding 版本与运行时刻，结论限当次快照。
- **生产依赖**：远程 Qdrant(eu-west-2 偶发超时) + embedding 成本。缓解：按岗一次 embedding、重试退避、失败岗单列。
- **PII**：导出含姓名+id，落 `.eval/`(gitignore)，入库只留无 PII 聚合报告。
- **状态过滤耦合**：`outcome='hired'` 与 legacy `status` 的映射需留意（当前实测 0 正例被 archived 过滤误伤；§4.5 已把该情形独立成类，不会误记为截断）。

## 11. 后续 spec（对着本评测集迭代）

1. **①召回快赢**：放开/重设召回上限、混合检索(dense+BM25)、JD embedding 缓存、去重、静默截断提示、子串→技能集精确匹配。→ 看 recall_capped 下降、recall@20 提升。
2. **②重排**：召回集(top 100~200) LLM/cross-encoder 重排 + 分档展示。→ 看 retrieved_low_rank 下降、MRR 提升。
3. **③埋点**：招聘方动作落表，为可学习打分与在线评测积累标签。
