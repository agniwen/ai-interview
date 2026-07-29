import type {
  StructuredResumeEvalGateResult,
  StructuredResumeEvalManifest,
  StructuredResumeEvalMetrics,
} from "./types";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function formatStructuredResumeEvalReport(input: {
  corpusHash: string;
  gate: StructuredResumeEvalGateResult;
  generatedAt: string;
  manifest: StructuredResumeEvalManifest;
  metrics: StructuredResumeEvalMetrics;
}): string {
  const { manifest, metrics } = input;
  return [
    `# 结构化简历评估校准报告 ${manifest.corpusVersion}`,
    "",
    `生成时间: ${input.generatedAt}`,
    `版本: engine=${manifest.engineVersion} prompt=${manifest.promptVersion} model=${manifest.modelId}`,
    `语料: corpus=${manifest.corpusVersion} gold=${manifest.goldLabelVersion} baseline=${manifest.baselineVersion}`,
    `语料哈希: ${input.corpusHash}`,
    `人工审批: ${manifest.approval.status}${manifest.approval.approver ? ` by ${manifest.approval.approver}` : ""}`,
    "",
    "## 指标与阈值",
    "",
    `- 完整结构化产物: ${percent(metrics.artifactSchemaValidity)} / ${percent(manifest.thresholds.artifactSchemaValidity)}`,
    `- 确定性计算与持久化不变量: ${percent(metrics.deterministicInvariants)} / ${percent(manifest.thresholds.deterministicInvariants)}`,
    `- 证据引用完整性: ${percent(metrics.evidenceCitationIntegrity)} / ${percent(manifest.thresholds.evidenceCitationIntegrity)}`,
    `- 硬门槛一致率: ${percent(metrics.hardGateAgreement)} / ${percent(manifest.thresholds.hardGateAgreement)}`,
    `- 最低单规则四状态 Macro-F1: ${percent(metrics.minimumRuleMacroF1)} / ${percent(manifest.thresholds.perRuleMacroF1)}`,
    `- 综合分 MAE: ${metrics.compositeScoreMae.toFixed(2)} / ≤ ${manifest.thresholds.compositeScoreMae}`,
    `- 综合分 P95 绝对误差: ${metrics.compositeScoreP95Error.toFixed(2)} / ≤ ${manifest.thresholds.compositeScoreP95Error}`,
    `- 综合分最大绝对误差: ${metrics.compositeScoreMaxError.toFixed(2)} / ≤ ${manifest.thresholds.compositeScoreMaxError}`,
    `- 等级一致率: ${percent(metrics.gradeAgreement)} / ${percent(manifest.thresholds.gradeAgreement)}`,
    "",
    `阈值结果: ${input.gate.passed ? "PASS" : "FAIL"}`,
    ...(input.gate.failures.length
      ? ["", "失败项:", ...input.gate.failures.map((failure) => `- ${failure}`)]
      : []),
    "",
    "说明: 本报告只评估版本化基线，不修改任何历史简历评估结果。prompt、schema 或语义行为变更必须提升 engine 版本。",
  ].join("\n");
}
