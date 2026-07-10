# 岗位人才推荐 — 评测集与基线度量 设计

> 日期：2026-07-10
> 状态：设计已确认，待评审
> 背景文档（知识库）：`1.极光矩阵/10.AI面试官/技术架构/岗位人才推荐-语义匹配与排序逻辑.md`、`需求/岗位人才推荐-优点缺点与优化建议.md`

## 1. 背景与目标

现有岗位人才推荐是"语义召回 + 分面加权"的 MVP（打分逻辑见 `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/recommendations.ts`）。招聘方反馈的首要痛点是**召回**："本该被推荐的人没出现或排得很后"（症状优先级：召回 > 排序可信 > 误报）。库规模约**几千份/组织**，而当前每分面召回上限仅 top 40/50，怀疑是**静默截断**导致漏人。

在动手优化前，必须先有一把**尺子**：一个能量化"好候选人有没有被召回"的评测器，并跑出**当前基线**。没有它，调权重/放上限都是盲调，无法证明改动是否有效。

**本 spec 只交付评测集 + 基线度量。** 召回优化（放开上限、混合检索）与重排是后续独立 spec，对着本评测集迭代。

## 2. 范围

**做：**

- 从历史漏斗信号挖标签（方案 B）+ 少量人工补强（方案 A）。
- 一个 **leave-one-out 召回评测器**：对每个"正例候选人"，在其所属岗位上跑真实推荐打分，测其排名。
- 输出**基线报告**：recall@20 / recall@50 / MRR，并把失败拆成"被截断"与"排名过后"。
- 一处支撑性重构：从推荐函数中抽出"打分内核"（返回完整排序，不套阈值/截断）。

**不做（后续 spec）：**

- 召回上限放开、混合检索（dense+BM25）、JD embedding 缓存 —— 属于"①快赢"。
- 召回集重排（LLM/cross-encoder）—— 属于"②重排"。
- 硬过滤门槛、可学习打分、分数校准、反馈埋点训练闭环。
- 负例挖掘（本轮召回度量主要靠正例，负例稀薄不影响）。

**约束：全程只读。** 不改数据库、不改 Qdrant 数据。

## 3. 标签来源

### 3.1 方案 B（历史信号，种子）

信号模型（`packages/db-schema/src/studio-interviews.ts`）：`pipelineStage`（screening → written_test → ai_interview → human_interview → offer → closed）+ `outcome`（in_pipeline / hired / rejected / withdrawn / archived）。

**正例规则**（"简历是好匹配"以"招聘方把他往下推"为代理，而非最终录用）：
某 `studio_interview` 行满足 `outcome='hired'` **或** `pipeline_stage ∈ {written_test, ai_interview, human_interview, offer}`，则该行 `(job_description_id, id)` 记为该岗位的一个正例。

**排除**：screening 阶段且 in_pipeline（未判）、withdrawn（自撤）、后期才 rejected（简历本身合格）、archived（语义模糊）。

**当前产量（org_default，只读实测 2026-07-10）**：1101 份简历，1076 绑岗，覆盖 50 岗。正例 ≈ **49 个**（ai_interview 45 + human_interview 2 + offer 2），分布在约 **20 个岗位**；hired 为 0；rejected 仅 8（不入本轮）。→ 薄但可用，够粗粒度召回评测。

### 3.2 方案 A（人工补强）

对正例最多的 **10~15 个岗位**，导出"该岗现有候选人（姓名 + id）"清单，招聘方勾选"本该被推荐"的人，并入同一标签集，使每岗正例达到 3~5 个，评测更稳。

A 补强可作为**第二步**：评测器先跑 B-only 出基线，A 补强后重跑。

### 3.3 标签存储

标签集存为一个本地/受控文件（如 JSON）：`{ jobDescriptionId, candidateId, source: "mined" | "manual" }[]`。`mineLabels` 产出 mined 部分，A 勾选结果追加 manual 部分。

## 4. 评测方法论（leave-one-out）

正例都是"已绑定且推进过"的人，而推荐默认 `excludeAlreadyLinked:true` 会排除他们。关键观察：**候选人的岗位绑定关系只影响"排除已绑定"过滤与展示字段，不参与打分**（打分纯粹是向量相似度）。因此**无需改库遮蔽**——只要以 `excludeAlreadyLinked=false` 运行即可，天然只读。

对每个正例对 `(J, P)`：

1. 以岗位 J 跑推荐**打分内核**，`excludeAlreadyLinked=false`，**保留**现有 top-40/50 召回上限，**去掉** 55 分阈值与 top-20 截断，得到该岗位候选人的**完整排序列表**。
2. 定位 P：
   - P **不在列表**（被 top-40/50 截断） → 记 `truncated`。
   - P 在列表，排名 `r` → 记 `rank=r`。
3. 聚合所有正例对。

## 5. 指标

- **recall@20**：`rank ≤ 20` 的正例占比（核心痛点指标，对应 UI 展示的 20 条）。
- **recall@50**：`rank ≤ 50` 的正例占比。
- **MRR**：`mean(1/rank)`（truncated 记 0）。
- **失败模式拆分**（关键诊断）：未进 top-20 的正例中，`truncated` 数 vs `rank>20` 数。
  - truncated 多 → **放开召回上限**（①）收益大。
  - rank>20 多 → **改打分/重排**（②）收益大。
- **按岗位明细表**：每岗正例数、命中数、被截断数，定位问题集中在哪些岗位。

## 6. 组件与数据流

```
mineLabels(org) ──┐
                  ├─► labels[] ──► evalRecall(labels) ──► metrics + 失败拆分 ──► report
A 勾选文件 ──────┘                     │
                            对每个 (J,P): scoreCore(J, excludeAlreadyLinked=false)
                                          → 完整排序 → 定位 P 排名/truncated
```

1. **`mineLabels(organizationId)`** — 按 §3.1 查库产出 mined 正例。只读。
2. **A 补强文件读取** — 读取 manual 标签并合并去重。
3. **打分内核 `scoreCandidatesForJobDescription`（重构，见 §7）** — 返回完整排序候选列表（含每人分数与相似度分面），不套阈值/截断。
4. **`evalRecall(labels)`** — 遍历正例对，调内核取排名，聚合指标与失败拆分、按岗位明细。
5. **`report(result)`** — 输出 markdown/控制台基线报告。

评测器位置：backend 应用下的独立脚本（如 `apps/ai-recruitment-copilot-backend/scripts/` 或等价约定，落地时对齐仓库现有惯例），通过 tsx/node 运行；复用 backend 的 db/Qdrant/embedding 库。

## 7. 支撑性重构

现有 `recommendCandidatesForJobDescription`（recommendations.ts:230）把"召回 → 合并分数 → 加权 → 排序"与"`score>=55` 过滤 + `slice(0, limit)` 截断"揉在一起。

**抽出打分内核**：新函数返回**完整排序列表**（每项含 score + 三分面相似度）。

- 生产函数 `recommendCandidatesForJobDescription` = 内核 + 55 阈值 + top-20 截断 + DTO 组装，**行为不变**。
- 评测器直接调内核拿完整排序。
- 后续 ①（放开上限）② 也复用此内核。

这是必要重构，保持生产路径行为等价（用现有 `recommendations.test.ts` 兜底）。

## 8. 产出

一份基线报告，形如：

```
== 岗位人才推荐 召回基线 (org_default, 2026-07-10) ==
正例对: 49  覆盖岗位: 20
recall@20 = 0.XX   recall@50 = 0.XX   MRR = 0.XX
未进 top-20: N 例 → 其中 truncated M 例 / rank>20 K 例
[按岗位表: jd | 正例 | @20命中 | truncated | rank>20]
```

## 9. 测试

- **评测器单测（合成小数据集）**：自造若干"简历向量 + 岗位 + 已知应排名"喂内核 mock，验证：应进 top-K 的必命中、被截断的必判 `truncated`、排名与 recall/MRR 计算正确。用 vitest，纯内存、不连外部。
- **真实基线运行**：连生产库 + Qdrant + embedding，产出 §8 报告（一次性分析运行，非 CI）。

## 10. 风险与开放项

- **标签薄**：B 仅 ~49 正例/20 岗；统计噪声大。缓解：A 补强到每岗 3~5 例；报告标注样本量，结论保守。
- **漏斗数据浅**：95% 简历卡在 screening 未判，正例天花板受限于历史处理量；随产品使用会变厚。
- **生产依赖**：评测连远程 Qdrant（eu-west-2，已知偶发连接超时）+ 每次 embedding 有成本。缓解：JD embedding 可在评测内做进程内缓存；失败重试。
- **A 补强的候选人 id 对人类不友好**：导出清单用姓名 + id，勾选回填 id；或后续做个极简勾选页（本轮不做）。

## 11. 后续 spec（对着本评测集迭代）

1. **①召回快赢**：放开/重设召回上限、混合检索（dense+BM25 硬技能）、JD embedding 缓存、去重、静默截断提示、子串→技能集精确匹配。跑评测看 recall@20 提升。
2. **②重排**：召回集（top 100~200）LLM/cross-encoder 重排 + 分档展示。跑评测看 MRR / recall@20 提升。
3. **③埋点**：招聘方动作落表，为将来可学习打分与在线评测积累标签。
