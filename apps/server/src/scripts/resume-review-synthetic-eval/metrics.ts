import { RESUME_REVIEW_DIMENSIONS } from "@app/shared/resume-review";
import type {
  SyntheticCaseMetrics,
  SyntheticEvalMetrics,
  SyntheticResumeReviewCase,
  SyntheticRunRecord,
} from "./types";

function rate(passed: number, total: number): number {
  return total ? passed / total : 0;
}

function optionalRate(passed: number, total: number): number | null {
  return total ? passed / total : null;
}

function spread(values: number[]): number {
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

function actionAgreement(runs: Extract<SyntheticRunRecord, { status: "success" }>[]): number {
  if (!runs.length) {
    return 0;
  }
  const counts = new Map<string, number>();
  for (const run of runs) {
    const { action } = run.review.nextStep;
    counts.set(action, (counts.get(action) ?? 0) + 1);
  }
  return Math.max(...counts.values()) / runs.length;
}

function computeCaseMetrics(
  testCase: SyntheticResumeReviewCase,
  runs: SyntheticRunRecord[],
): SyntheticCaseMetrics {
  const successful = runs.filter(
    (run): run is Extract<SyntheticRunRecord, { status: "success" }> => run.status === "success",
  );
  let bandChecks = 0;
  let bandPasses = 0;
  let rationaleChecks = 0;
  let rationalePasses = 0;
  let maxDimensionScoreSpread = 0;

  for (const dimension of RESUME_REVIEW_DIMENSIONS) {
    const scores = successful.map((run) => run.review.dimensions[dimension.key].score);
    maxDimensionScoreSpread = Math.max(maxDimensionScoreSpread, spread(scores));
    const band = testCase.expectations.dimensionBands[dimension.key];
    const terms = testCase.expectations.rationaleTerms[dimension.key];
    for (const run of successful) {
      if (band) {
        bandChecks += 1;
        const { score } = run.review.dimensions[dimension.key];
        if (score >= band.min && score <= band.max) {
          bandPasses += 1;
        }
      }
      if (terms?.length) {
        rationaleChecks += 1;
        const rationale = run.review.dimensions[dimension.key].rationale.toLowerCase();
        if (terms.some((term) => rationale.includes(term.toLowerCase()))) {
          rationalePasses += 1;
        }
      }
    }
  }

  return {
    actionAgreementRate: actionAgreement(successful),
    allowedActionRate: rate(
      successful.filter((run) =>
        testCase.expectations.allowedActions.includes(run.review.nextStep.action),
      ).length,
      successful.length,
    ),
    baseScoreSpread: spread(successful.map((run) => run.review.overall.baseScore)),
    caseId: testCase.id,
    caseName: testCase.name,
    dimensionBandPassRate: optionalRate(bandPasses, bandChecks),
    failedRuns: runs.length - successful.length,
    maxDimensionScoreSpread,
    rationaleTermCoverage: optionalRate(rationalePasses, rationaleChecks),
    successfulRuns: successful.length,
    totalRuns: runs.length,
  };
}

function weightedRate(
  perCase: SyntheticCaseMetrics[],
  key: "actionAgreementRate" | "allowedActionRate",
): number {
  const successfulRuns = perCase.reduce((sum, item) => sum + item.successfulRuns, 0);
  return successfulRuns
    ? perCase.reduce((sum, item) => sum + item[key] * item.successfulRuns, 0) / successfulRuns
    : 0;
}

export function computeSyntheticEvalMetrics(
  cases: SyntheticResumeReviewCase[],
  runs: SyntheticRunRecord[],
): SyntheticEvalMetrics {
  const perCase = cases.map((testCase) =>
    computeCaseMetrics(
      testCase,
      runs.filter((run) => run.caseId === testCase.id),
    ),
  );
  const successfulRuns = perCase.reduce((sum, item) => sum + item.successfulRuns, 0);
  const totalRuns = perCase.reduce((sum, item) => sum + item.totalRuns, 0);
  const dimensionBandPassRates = perCase
    .map((item) => item.dimensionBandPassRate)
    .filter((value): value is number => value !== null);
  const rationaleTermCoverageRates = perCase
    .map((item) => item.rationaleTermCoverage)
    .filter((value): value is number => value !== null);
  return {
    actionAgreementRate: weightedRate(perCase, "actionAgreementRate"),
    allowedActionRate: weightedRate(perCase, "allowedActionRate"),
    baseScoreSpreadMax: Math.max(0, ...perCase.map((item) => item.baseScoreSpread)),
    dimensionBandPassRate: dimensionBandPassRates.length
      ? dimensionBandPassRates.reduce((sum, value) => sum + value, 0) /
        dimensionBandPassRates.length
      : null,
    maxDimensionScoreSpread: Math.max(0, ...perCase.map((item) => item.maxDimensionScoreSpread)),
    perCase,
    rationaleTermCoverage: rationaleTermCoverageRates.length
      ? rationaleTermCoverageRates.reduce((sum, value) => sum + value, 0) /
        rationaleTermCoverageRates.length
      : null,
    successRate: rate(successfulRuns, totalRuns),
    totalRuns,
  };
}

export function getSyntheticEvalStrictFailures(
  metrics: SyntheticEvalMetrics,
  runsPerCase: number,
): string[] {
  return [
    runsPerCase < 3 && "strict 模式每个案例至少需要运行 3 次",
    metrics.successRate < 1 && "结构成功率低于 100%",
    metrics.allowedActionRate < 1 && "存在不允许的 nextStep.action",
    metrics.actionAgreementRate < 0.8 && "行动一致率低于 80%",
    metrics.dimensionBandPassRate !== null &&
      metrics.dimensionBandPassRate < 0.9 &&
      "维度区间命中率低于 90%",
    metrics.rationaleTermCoverage !== null &&
      metrics.rationaleTermCoverage < 0.8 &&
      "理由证据覆盖率低于 80%",
    metrics.baseScoreSpreadMax > 10 && "总分最大波动超过 10",
  ].filter((failure): failure is string => typeof failure === "string");
}
