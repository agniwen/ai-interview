import type { DatasetDiagnostics, ResumeReviewEvalMetrics } from "./types";

export interface ResumeReviewEvalReportInput {
  datasetHash: string;
  diagnostics: DatasetDiagnostics;
  endedAt: string;
  gitSha: string;
  metrics: ResumeReviewEvalMetrics;
  organizationId: string;
  startedAt: string;
}

const pct = (value: number | null) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
const metric = (value: number | null) => (value === null ? "n/a" : value.toFixed(3));
const counts = (values: Record<string, number | undefined>) =>
  Object.entries(values)
    .filter(([, value]) => value)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(" ") || "无";

export function formatResumeReviewEvalReport(input: ResumeReviewEvalReportInput): string {
  const coverage = input.diagnostics.labelEligibleRows
    ? input.diagnostics.evaluableRows / input.diagnostics.labelEligibleRows
    : 0;
  const { all, guardrails, strong } = input.metrics;
  const dimensions = Object.entries(input.metrics.dimensionDeltas).map(([key, value]) =>
    value
      ? `- ${key}: 正例=${value.positiveMean?.toFixed(1) ?? "n/a"} 负例=${value.negativeMean?.toFixed(1) ?? "n/a"} 差值=${value.delta?.toFixed(1) ?? "n/a"}`
      : `- ${key}: n/a`,
  );
  return [
    `# 简历评分离线评测 (${input.organizationId})`,
    "",
    `运行: ${input.startedAt} → ${input.endedAt}`,
    `元数据: git=${input.gitSha} dataset=${input.datasetHash}`,
    `原始/标签可用/可评测: ${input.diagnostics.totalRows}/${input.diagnostics.labelEligibleRows}/${input.diagnostics.evaluableRows}`,
    `可评测覆盖率: ${pct(coverage)}${coverage < 0.8 ? " ⚠️ 选择性偏差风险" : ""}`,
    `标签分布: ${counts(input.diagnostics.labelCounts)}`,
    `排除原因: ${counts(input.diagnostics.exclusionCounts)}`,
    `非致命质量问题: ${counts(input.diagnostics.qualityIssueCounts)}`,
    "",
    "## 安全护栏",
    "",
    `已录用误 reject: ${guardrails.hiredRejectCount}/${guardrails.hiredCount} (${pct(guardrails.hiredRejectRate)})`,
    `全部正例误 reject: ${pct(guardrails.positiveRejectRate)}`,
    "",
    "## 总体指标",
    "",
    `样本: ${all.sampleCount} (正=${all.positiveCount}, 负=${all.negativeCount})`,
    `排序: ROC-AUC=${metric(all.rocAuc)} AP=${metric(all.averagePrecision)}`,
    `校准: Brier=${metric(all.brierScore)} ECE=${metric(all.ece)}`,
    `动作: decision coverage=${pct(all.decisionCoverage)} macro-F1=${metric(all.macroF1OnDecided)}`,
    `强标签: ROC-AUC=${metric(strong.rocAuc)} AP=${metric(strong.averagePrecision)} n=${strong.sampleCount}`,
    "",
    "## 六维诊断",
    "",
    ...(dimensions.length ? dimensions : ["- 无可用维度"]),
    "",
    "## 解释边界",
    "",
    "当前库只保留最新评价，未保存生成时的 JD/简历快照、模型版本与 prompt 版本，因此无法严格重放；本报告只能作为历史关联诊断，不能视为无偏因果金标。",
  ].join("\n");
}
