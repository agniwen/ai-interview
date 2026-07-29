import type {
  StructuredResumeEvalCase,
  StructuredResumeEvalGateResult,
  StructuredResumeEvalMetrics,
  StructuredResumeEvalThresholds,
  StructuredRuleStatus,
} from "./types";
import { STRUCTURED_RULE_STATUS_CLASSES } from "./types";

const ratio = (count: number, total: number) => (total === 0 ? 0 : count / total);

function macroF1(expected: StructuredRuleStatus[], actual: StructuredRuleStatus[]): number {
  const scores = STRUCTURED_RULE_STATUS_CLASSES.map((status) => {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    for (const [index, expectedStatus] of expected.entries()) {
      const actualStatus = actual[index];
      truePositive += Number(expectedStatus === status && actualStatus === status);
      falsePositive += Number(expectedStatus !== status && actualStatus === status);
      falseNegative += Number(expectedStatus === status && actualStatus !== status);
    }
    const denominator = 2 * truePositive + falsePositive + falseNegative;
    return denominator === 0 ? 1 : (2 * truePositive) / denominator;
  });
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function computeStructuredResumeEvalMetrics(
  cases: StructuredResumeEvalCase[],
): StructuredResumeEvalMetrics {
  const errors = cases
    .map((item) => Math.abs(item.baseline.compositeScore - item.gold.compositeScore))
    .toSorted((left, right) => left - right);
  const ruleIds = new Set(cases.flatMap((item) => Object.keys(item.gold.ruleJudgments)));
  const perRuleMacroF1: Record<string, number> = {};
  for (const ruleId of ruleIds) {
    const comparable = cases.filter(
      (item) =>
        item.gold.ruleJudgments[ruleId] !== undefined &&
        item.baseline.ruleJudgments[ruleId] !== undefined,
    );
    perRuleMacroF1[ruleId] = macroF1(
      comparable.map((item) => item.gold.ruleJudgments[ruleId] ?? "not_applicable"),
      comparable.map((item) => item.baseline.ruleJudgments[ruleId] ?? "not_applicable"),
    );
  }
  const ruleScores = Object.values(perRuleMacroF1);
  const p95Index = Math.max(0, Math.ceil(errors.length * 0.95) - 1);
  return {
    artifactSchemaValidity: ratio(
      cases.filter((item) => item.baseline.artifactSchemaValid).length,
      cases.length,
    ),
    compositeScoreMae: ratio(
      errors.reduce((sum, error) => sum + error, 0),
      cases.length,
    ),
    compositeScoreMaxError: errors.at(-1) ?? 0,
    compositeScoreP95Error: errors[p95Index] ?? 0,
    deterministicInvariants: ratio(
      cases.filter((item) => item.baseline.deterministicInvariantsValid).length,
      cases.length,
    ),
    evidenceCitationIntegrity: ratio(
      cases.filter((item) => item.baseline.evidenceCitationIntegrity).length,
      cases.length,
    ),
    gradeAgreement: ratio(
      cases.filter((item) => item.baseline.grade === item.gold.grade).length,
      cases.length,
    ),
    hardGateAgreement: ratio(
      cases.filter((item) => item.baseline.gateStatus === item.gold.gateStatus).length,
      cases.length,
    ),
    minimumRuleMacroF1: ruleScores.length ? Math.min(...ruleScores) : 0,
    perRuleMacroF1,
    sampleCount: cases.length,
  };
}

export function evaluateStructuredResumeThresholds(
  metrics: StructuredResumeEvalMetrics,
  thresholds: StructuredResumeEvalThresholds,
): StructuredResumeEvalGateResult {
  const failures: string[] = [];
  const minimums = [
    ["artifactSchemaValidity", metrics.artifactSchemaValidity, thresholds.artifactSchemaValidity],
    [
      "deterministicInvariants",
      metrics.deterministicInvariants,
      thresholds.deterministicInvariants,
    ],
    [
      "evidenceCitationIntegrity",
      metrics.evidenceCitationIntegrity,
      thresholds.evidenceCitationIntegrity,
    ],
    ["hardGateAgreement", metrics.hardGateAgreement, thresholds.hardGateAgreement],
    ["minimumRuleMacroF1", metrics.minimumRuleMacroF1, thresholds.perRuleMacroF1],
    ["gradeAgreement", metrics.gradeAgreement, thresholds.gradeAgreement],
  ] as const;
  for (const [name, actual, expected] of minimums) {
    if (actual < expected) {
      failures.push(`${name}=${actual} < ${expected}`);
    }
  }
  const maximums = [
    ["compositeScoreMae", metrics.compositeScoreMae, thresholds.compositeScoreMae],
    ["compositeScoreP95Error", metrics.compositeScoreP95Error, thresholds.compositeScoreP95Error],
    ["compositeScoreMaxError", metrics.compositeScoreMaxError, thresholds.compositeScoreMaxError],
  ] as const;
  for (const [name, actual, expected] of maximums) {
    if (actual > expected) {
      failures.push(`${name}=${actual} > ${expected}`);
    }
  }
  return { failures, passed: failures.length === 0 };
}
