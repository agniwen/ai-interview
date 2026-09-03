import type { SyntheticJdMatchMetrics } from "./types";

export interface JdMatchSyntheticReportInput {
  endedAt: string;
  gitSha: string;
  metrics: SyntheticJdMatchMetrics;
  runsPerCase: number;
  startedAt: string;
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export function formatJdMatchSyntheticReport(input: JdMatchSyntheticReportInput): string {
  const rows = input.metrics.perCase.map(
    (item) =>
      `- ${item.caseId} (${item.caseName}): success=${item.successfulRuns}/${item.totalRuns} valid=${pct(item.candidateIdValidityRate)} top1=${pct(item.expectedTop1Rate)} agreement=${pct(item.selectionAgreementRate)} reason=${pct(item.reasonTermCoverage)}`,
  );
  return [
    "# JD 匹配 Agent 合成稳定性评测",
    "",
    `运行: ${input.startedAt} → ${input.endedAt}`,
    `元数据: git=${input.gitSha} runsPerCase=${input.runsPerCase}`,
    `结构成功率: ${pct(input.metrics.successRate)}`,
    `候选 ID 合法率: ${pct(input.metrics.candidateIdValidityRate)}`,
    `预期 Top-1 命中率: ${pct(input.metrics.expectedTop1Rate)}`,
    `重复选择一致率: ${pct(input.metrics.selectionAgreementRate)}`,
    `理由证据覆盖率: ${pct(input.metrics.reasonTermCoverage)}`,
    "",
    "## 分案例",
    "",
    ...(rows.length ? rows : ["- 无运行结果"]),
    "",
    "## 解释边界",
    "",
    "该评测仅用于 JD 匹配 Agent 的结构契约、合成 Top-1 判断和重复运行稳定性，不代表真实岗位匹配效果，也不得替代真实招聘结果评测。",
  ].join("\n");
}
