import { describe, expect, it } from "vitest";
import { selectReusableResumePoolEvaluation } from "./evaluation-reuse";

const dimension = {
  basis: "job" as const,
  evaluation: "候选人事实与岗位要求一致。",
  level: "recommended" as const,
};
const evaluation = {
  conciseOverall: "候选人的核心经验与岗位要求匹配，建议进入下一轮。",
  detailedOverall: {
    judgment: "整体匹配。",
    matchingEvidence: "有相关项目经验。",
    risks: "需确认项目规模。",
  },
  dimensions: {
    educationBackground: dimension,
    experienceRelevance: dimension,
    potential: dimension,
    projectMatch: dimension,
    skillMatch: dimension,
    stability: dimension,
  },
  recommendationLevel: "recommended" as const,
  schemaVersion: 2 as const,
  seniorityRecommendation: null,
  teamPositioning: null,
};

type EvaluationSource = Parameters<typeof selectReusableResumePoolEvaluation>[0];

function source(overrides: Partial<EvaluationSource> = {}): EvaluationSource {
  return {
    jobDescriptionId: "jd-1",
    qualitativeJobDescriptionVersionId: "jd-version-1",
    qualitativeRecommendationLevel: "recommended",
    qualitativeResumeEvaluation: evaluation,
    qualitativeResumeSummary: evaluation.conciseOverall,
    resumeEvaluationContractVersion: "qualitative-v2",
    resumeEvaluationGeneratedAt: new Date("2026-08-28T02:00:00.000Z"),
    resumeEvaluationInputHash: "input-hash",
    ...overrides,
  };
}

describe("selectReusableResumePoolEvaluation", () => {
  it("reuses a qualitative-v2 result when the imported job is unchanged", () => {
    expect(selectReusableResumePoolEvaluation(source(), "jd-1")).toMatchObject({
      contractVersion: "qualitative-v2",
      evaluation,
      jobDescriptionVersionId: "jd-version-1",
    });
  });

  it("does not reuse the result when the imported job changes", () => {
    expect(selectReusableResumePoolEvaluation(source(), "jd-2")).toBeNull();
  });

  it("does not reuse legacy or internally inconsistent artifacts", () => {
    expect(
      selectReusableResumePoolEvaluation(
        source({ resumeEvaluationContractVersion: "legacy-resume-review-v4" }),
        "jd-1",
      ),
    ).toBeNull();
    expect(
      selectReusableResumePoolEvaluation(
        source({ qualitativeRecommendationLevel: "highly_recommended" }),
        "jd-1",
      ),
    ).toBeNull();
  });
});
