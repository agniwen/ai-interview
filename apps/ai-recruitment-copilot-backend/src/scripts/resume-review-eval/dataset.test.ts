import { describe, expect, it } from "vitest";
import type { ResumeReview } from "@arc/shared/resume-review";
import { buildResumeReviewEvalDataset } from "./dataset";
import type { ResumeReviewEvalRow } from "./types";

const REVIEW: ResumeReview = {
  biasScan: { items: [] },
  dimensions: {
    educationBackground: { rationale: "教育", score: 70 },
    experienceRelevance: { rationale: "经验", score: 80 },
    potential: { rationale: "潜力", score: 75 },
    projectMatch: { rationale: "项目", score: 85 },
    skillMatch: { rationale: "技能", score: 90 },
    stability: { rationale: "稳定", score: 65 },
  },
  levelRecommendation: { level: "中级", rationale: "依据" },
  nextStep: {
    action: "interview",
    disclaimer: "以上为初步结论",
    interviewFocus: [],
    rationale: "建议进入面试",
  },
  overall: { baseScore: 82, conclusion: "匹配", scoreRationale: "六维加权" },
  schemaVersion: 4,
  strengths: [{ evidence: "证据", impact: "影响", point: "优点" }],
  teamPositioning: { rationale: "依据", suggestion: "建议" },
  weaknesses: [{ evidence: null, impact: "影响", point: "风险" }],
};

function row(overrides: Partial<ResumeReviewEvalRow> = {}): ResumeReviewEvalRow {
  return {
    candidateId: "candidate-1",
    closedMeta: null,
    jobDescriptionId: "jd-1",
    organizationId: "org-1",
    outcome: "hired",
    pipelineStage: "closed",
    resumeEvaluationStatus: "pass",
    resumeReview: REVIEW,
    resumeReviewGeneratedAt: new Date("2026-07-01T00:00:00.000Z"),
    resumeReviewRunId: "run-1",
    resumeReviewStatus: "ready",
    resumeScreeningResult: {
      policyEmpty: false,
      policyEnabled: true,
      policyHash: "hash",
      policyVersion: 1,
      recommendation: "pass",
      ruleResults: [],
    },
    resumeScreeningStatus: "ready",
    ...overrides,
  };
}

describe("buildResumeReviewEvalDataset", () => {
  it("builds de-identified score/outcome samples with review and screening fields", () => {
    const result = buildResumeReviewEvalDataset([row()]);

    expect(result.samples).toEqual([
      expect.objectContaining({
        action: "interview",
        baseScore: 82,
        candidateId: "candidate-1",
        dimensionScores: {
          educationBackground: 70,
          experienceRelevance: 80,
          potential: 75,
          projectMatch: 85,
          skillMatch: 90,
          stability: 65,
        },
        humanResumeEvaluationStatus: "pass",
        jobDescriptionId: "jd-1",
        label: "positive",
        labelReason: "hired",
        labelStrength: "strong",
        reviewGeneratedAt: "2026-07-01T00:00:00.000Z",
        reviewRunId: "run-1",
        screeningRecommendation: "pass",
      }),
    ]);
    expect(result.diagnostics).toMatchObject({
      evaluableRows: 1,
      labelEligibleRows: 1,
      totalRows: 1,
    });
  });

  it("reports mutually exclusive exclusions and non-fatal quality issues", () => {
    const incompleteReview = {
      ...REVIEW,
      dimensions: { skillMatch: REVIEW.dimensions.skillMatch },
    };
    const result = buildResumeReviewEvalDataset([
      row({ candidateId: "withdrawn", outcome: "withdrawn" }),
      row({ candidateId: "missing-jd", jobDescriptionId: null }),
      row({ candidateId: "not-ready", resumeReviewStatus: "failed" }),
      row({ candidateId: "invalid", resumeReview: { bad: true } }),
      row({
        candidateId: "incomplete",
        resumeReview: incompleteReview,
        resumeReviewGeneratedAt: null,
        resumeReviewRunId: null,
        resumeScreeningResult: { bad: true },
      }),
    ]);

    expect(result.samples.map((sample) => sample.candidateId)).toEqual(["incomplete"]);
    expect(result.diagnostics).toMatchObject({
      evaluableRows: 1,
      exclusionCounts: {
        invalid_review: 1,
        missing_job_description: 1,
        review_not_ready: 1,
        withdrawn: 1,
      },
      labelEligibleRows: 4,
      qualityIssueCounts: {
        incomplete_dimensions: 1,
        invalid_screening_result: 1,
        missing_review_generated_at: 1,
        missing_review_run_id: 1,
      },
      totalRows: 5,
    });
  });
});
