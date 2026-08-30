import { describe, expect, it } from "vitest";
import { formatResumeReviewEvalReport } from "./report";

describe("formatResumeReviewEvalReport", () => {
  it("renders coverage, hired false-reject guardrail, score metrics and replay limitation", () => {
    const report = formatResumeReviewEvalReport({
      datasetHash: "abc123",
      diagnostics: {
        evaluableRows: 8,
        exclusionCounts: { not_mature: 1, withdrawn: 1 },
        labelCounts: { "negative:strong": 2, "positive:strong": 3, "positive:weak": 3 },
        labelEligibleRows: 10,
        qualityIssueCounts: { incomplete_dimensions: 1 },
        totalRows: 12,
      },
      endedAt: "2026-07-18T01:01:00.000Z",
      gitSha: "abcdef12",
      metrics: {
        all: {
          actionConfusion: {
            negative: { hold: 0, interview: 1, reject: 1 },
            positive: { hold: 1, interview: 4, reject: 1 },
          },
          averagePrecision: 0.8,
          brierScore: 0.2,
          decisionCoverage: 0.875,
          ece: 0.15,
          macroF1OnDecided: 0.7,
          negativeCount: 2,
          positiveCount: 6,
          rocAuc: 0.75,
          sampleCount: 8,
        },
        dimensionDeltas: {},
        guardrails: {
          hiredCount: 3,
          hiredRejectCount: 1,
          hiredRejectRate: 1 / 3,
          positiveRejectRate: 1 / 6,
        },
        perJob: [],
        scoreBins: [],
        strong: {
          actionConfusion: {
            negative: { hold: 0, interview: 0, reject: 2 },
            positive: { hold: 0, interview: 2, reject: 1 },
          },
          averagePrecision: 0.9,
          brierScore: 0.1,
          decisionCoverage: 1,
          ece: 0.1,
          macroF1OnDecided: 0.8,
          negativeCount: 2,
          positiveCount: 3,
          rocAuc: 0.85,
          sampleCount: 5,
        },
      },
      organizationId: "org-1",
      startedAt: "2026-07-18T01:00:00.000Z",
    });

    expect(report).toContain("可评测覆盖率: 80.0%");
    expect(report).toContain("已录用误 reject: 1/3 (33.3%)");
    expect(report).toContain("ROC-AUC=0.750");
    expect(report).toContain("无法严格重放");
  });
});
