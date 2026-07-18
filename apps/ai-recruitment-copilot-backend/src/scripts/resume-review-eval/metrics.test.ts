import { describe, expect, it } from "vitest";
import { computeResumeReviewEvalMetrics } from "./metrics";
import type { ResumeReviewEvalSample } from "./types";

function sample(overrides: Partial<ResumeReviewEvalSample>): ResumeReviewEvalSample {
  return {
    action: "interview",
    baseScore: 80,
    candidateId: "candidate",
    closeCategory: null,
    dimensionScores: {
      educationBackground: 70,
      experienceRelevance: 80,
      potential: 75,
      projectMatch: 85,
      skillMatch: 90,
      stability: 65,
    },
    humanResumeEvaluationStatus: null,
    jobDescriptionId: "jd-1",
    label: "positive",
    labelReason: "advanced_pipeline",
    labelStrength: "weak",
    organizationId: "org-1",
    outcome: "in_pipeline",
    pipelineStage: "ai_interview",
    previousStage: null,
    qualityIssues: [],
    reviewGeneratedAt: null,
    reviewRunId: null,
    reviewSchemaVersion: 4,
    screeningRecommendation: null,
    ...overrides,
  };
}

describe("computeResumeReviewEvalMetrics", () => {
  it("computes false-reject guardrails, action confusion, discrimination and calibration", () => {
    const metrics = computeResumeReviewEvalMetrics([
      sample({
        action: "reject",
        baseScore: 40,
        candidateId: "hired",
        labelReason: "hired",
        labelStrength: "strong",
        outcome: "hired",
      }),
      sample({ baseScore: 80, candidateId: "advanced" }),
      sample({
        action: "reject",
        baseScore: 20,
        candidateId: "negative-strong",
        label: "negative",
        labelReason: "screening_skills_mismatch",
        labelStrength: "strong",
        outcome: "rejected",
        pipelineStage: "closed",
        previousStage: "screening",
      }),
      sample({
        action: "hold",
        baseScore: 70,
        candidateId: "negative-weak",
        label: "negative",
        labelReason: "screening_rejected",
        outcome: "rejected",
        pipelineStage: "closed",
        previousStage: "screening",
      }),
    ]);

    expect(metrics.guardrails).toMatchObject({
      hiredCount: 1,
      hiredRejectCount: 1,
      hiredRejectRate: 1,
      positiveRejectRate: 0.5,
    });
    expect(metrics.all.actionConfusion).toEqual({
      negative: { hold: 1, interview: 0, reject: 1 },
      positive: { hold: 0, interview: 1, reject: 1 },
    });
    expect(metrics.all.decisionCoverage).toBe(0.75);
    expect(metrics.all.macroF1OnDecided).toBeCloseTo(2 / 3);
    expect(metrics.all.rocAuc).toBe(0.75);
    expect(metrics.all.averagePrecision).toBeCloseTo(5 / 6);
    expect(metrics.all.brierScore).toBeCloseTo(0.2325);
    expect(metrics.strong.rocAuc).toBe(1);
  });

  it("returns null rank metrics when a slice lacks both classes", () => {
    const metrics = computeResumeReviewEvalMetrics([sample({})]);
    expect(metrics.all.rocAuc).toBeNull();
    expect(metrics.all.averagePrecision).toBeNull();
    expect(metrics.all.macroF1OnDecided).toBeNull();
  });
});
