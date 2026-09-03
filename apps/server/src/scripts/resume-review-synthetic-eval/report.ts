import type { SyntheticEvalMetrics } from "./types";

export interface SyntheticEvalReportInput {
  endedAt: string;
  gitSha: string;
  metrics: SyntheticEvalMetrics;
  runsPerCase: number;
  startedAt: string;
}

const pct = (value: number | null) => (value === null ? "N/A" : `${(value * 100).toFixed(1)}%`);

export function formatSyntheticEvalReport(input: SyntheticEvalReportInput): string {
  const rows = input.metrics.perCase.map(
    (item) =>
      `- ${item.caseId} (${item.caseName}): success=${item.successfulRuns}/${item.totalRuns} action=${pct(item.allowedActionRate)} agreement=${pct(item.actionAgreementRate)} band=${pct(item.dimensionBandPassRate)} evidence=${pct(item.rationaleTermCoverage)} baseSpread=${item.baseScoreSpread} dimensionSpread=${item.maxDimensionScoreSpread}`,
  );
  return [
    "# 简历评分合成稳定性评测",
    "",
    `运行: ${input.startedAt} → ${input.endedAt}`,
    `元数据: git=${input.gitSha} runsPerCase=${input.runsPerCase}`,
    `结构成功率: ${pct(input.metrics.successRate)}`,
    `允许行动命中率: ${pct(input.metrics.allowedActionRate)}`,
    `行动一致率: ${pct(input.metrics.actionAgreementRate)}`,
    `维度区间命中率: ${pct(input.metrics.dimensionBandPassRate)}`,
    `理由证据覆盖率: ${pct(input.metrics.rationaleTermCoverage)}`,
    `总分最大波动: ${input.metrics.baseScoreSpreadMax}`,
    `六维最大波动（观察项）: ${input.metrics.maxDimensionScoreSpread}`,
    "",
    "## 分案例",
    "",
    ...(rows.length ? rows : ["- 无运行结果"]),
    "",
    "## 解释边界",
    "",
    "该评测仅用于 Prompt 稳定性、结构契约和人工校准锚点检查；六维最大波动仅用于观察单维离群，不作为 strict 硬门禁。不代表真实录用效果，也不得用于拟合业务权重或阈值。",
  ].join("\n");
}
