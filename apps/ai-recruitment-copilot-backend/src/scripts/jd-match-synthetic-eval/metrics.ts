import type {
  SyntheticJdMatchCase,
  SyntheticJdMatchCaseMetrics,
  SyntheticJdMatchMetrics,
  SyntheticJdMatchRunRecord,
} from "./types";

function rate(passed: number, total: number): number {
  return total ? passed / total : 0;
}

function selectionAgreement(
  runs: Extract<SyntheticJdMatchRunRecord, { status: "success" }>[],
): number {
  if (!runs.length) {
    return 0;
  }
  const counts = new Map<string, number>();
  for (const run of runs) {
    const id = run.result.jobDescriptionId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return Math.max(...counts.values()) / runs.length;
}

function computeCaseMetrics(
  testCase: SyntheticJdMatchCase,
  runs: SyntheticJdMatchRunRecord[],
): SyntheticJdMatchCaseMetrics {
  const successful = runs.filter(
    (run): run is Extract<SyntheticJdMatchRunRecord, { status: "success" }> =>
      run.status === "success",
  );
  const candidateIds = new Set(testCase.candidates.map((candidate) => candidate.id));
  const expectedHits = successful.filter(
    (run) => run.result.jobDescriptionId === testCase.expectedId,
  ).length;
  const reasonHits = successful.filter((run) => {
    const reason = run.result.reason?.toLowerCase() ?? "";
    return testCase.reasonTerms.some((term) => reason.includes(term.toLowerCase()));
  }).length;

  return {
    candidateIdValidityRate: rate(
      successful.filter((run) => candidateIds.has(run.result.jobDescriptionId)).length,
      successful.length,
    ),
    caseId: testCase.id,
    caseName: testCase.name,
    expectedHits,
    expectedTop1Rate: rate(expectedHits, successful.length),
    failedRuns: runs.length - successful.length,
    reasonTermCoverage: rate(reasonHits, successful.length),
    selectionAgreementRate: selectionAgreement(successful),
    successfulRuns: successful.length,
    totalRuns: runs.length,
  };
}

function weightedRate(
  perCase: SyntheticJdMatchCaseMetrics[],
  key:
    | "candidateIdValidityRate"
    | "expectedTop1Rate"
    | "reasonTermCoverage"
    | "selectionAgreementRate",
): number {
  const successfulRuns = perCase.reduce((sum, item) => sum + item.successfulRuns, 0);
  return successfulRuns
    ? perCase.reduce((sum, item) => sum + item[key] * item.successfulRuns, 0) / successfulRuns
    : 0;
}

export function computeJdMatchSyntheticMetrics(
  cases: SyntheticJdMatchCase[],
  runs: SyntheticJdMatchRunRecord[],
): SyntheticJdMatchMetrics {
  const perCase = cases.map((testCase) =>
    computeCaseMetrics(
      testCase,
      runs.filter((run) => run.caseId === testCase.id),
    ),
  );
  const successfulRuns = perCase.reduce((sum, item) => sum + item.successfulRuns, 0);
  const totalRuns = perCase.reduce((sum, item) => sum + item.totalRuns, 0);

  return {
    candidateIdValidityRate: weightedRate(perCase, "candidateIdValidityRate"),
    expectedTop1Rate: weightedRate(perCase, "expectedTop1Rate"),
    perCase,
    reasonTermCoverage: weightedRate(perCase, "reasonTermCoverage"),
    selectionAgreementRate: weightedRate(perCase, "selectionAgreementRate"),
    successRate: rate(successfulRuns, totalRuns),
    totalRuns,
  };
}

export function getJdMatchStrictFailures(
  metrics: SyntheticJdMatchMetrics,
  runsPerCase: number,
): string[] {
  return [
    runsPerCase < 3 && "strict 模式每个案例至少需要运行 3 次",
    metrics.successRate < 1 && "结构成功率低于 100%",
    metrics.candidateIdValidityRate < 1 && "存在候选列表外的 JD ID",
    metrics.expectedTop1Rate < 0.9 && "预期 Top-1 命中率低于 90%",
    metrics.selectionAgreementRate < 0.8 && "重复选择一致率低于 80%",
    metrics.reasonTermCoverage < 0.8 && "理由证据覆盖率低于 80%",
  ].filter((failure): failure is string => typeof failure === "string");
}
