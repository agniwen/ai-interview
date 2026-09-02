import { describe, expect, it } from "vitest";
import type { ResumeReview } from "@app/shared/resume-review";
import { computeSyntheticEvalMetrics, getSyntheticEvalStrictFailures } from "./metrics";
import type { SyntheticResumeReviewCase, SyntheticRunRecord } from "./types";

const CASE: SyntheticResumeReviewCase = {
  expectations: {
    allowedActions: ["interview", "hold"],
    dimensionBands: {
      experienceRelevance: { max: 80, min: 65 },
      skillMatch: { max: 95, min: 75 },
    },
    rationaleTerms: { skillMatch: ["React", "TypeScript"] },
  },
  id: "strong-match",
  jobDescription: "前端工程师，要求 React 与 TypeScript",
  name: "强匹配",
  resumeProfile: {
    age: null,
    educationExperiences: [],
    email: null,
    gender: null,
    name: "合成候选人",
    personalStrengths: [],
    phone: null,
    projectExperiences: [],
    schools: [],
    skills: ["React", "TypeScript"],
    targetRoles: ["前端工程师"],
    workExperiences: [],
    workYears: 5,
  },
};

function review(overrides: {
  action?: ResumeReview["nextStep"]["action"];
  baseScore: number;
  experienceScore: number;
  skillRationale: string;
  skillScore: number;
}): ResumeReview {
  return {
    biasScan: { items: [] },
    dimensions: {
      educationBackground: { rationale: "教育证据", score: 70 },
      experienceRelevance: { rationale: "经验证据", score: overrides.experienceScore },
      potential: { rationale: "潜力证据", score: 75 },
      projectMatch: { rationale: "项目证据", score: 76 },
      skillMatch: { rationale: overrides.skillRationale, score: overrides.skillScore },
      stability: { rationale: "稳定性证据", score: 65 },
    },
    levelRecommendation: { level: "中级", rationale: "年限和职责" },
    nextStep: {
      action: overrides.action ?? "interview",
      disclaimer: "以上为初步结论",
      interviewFocus: [],
      rationale: "建议推进",
    },
    overall: {
      baseScore: overrides.baseScore,
      conclusion: "匹配",
      scoreRationale: "六维加权",
    },
    schemaVersion: 4,
    strengths: [{ evidence: "React 项目", impact: "匹配岗位", point: "技能匹配" }],
    teamPositioning: { rationale: "技术栈匹配", suggestion: "前端团队" },
    weaknesses: [{ evidence: null, impact: "待核实", point: "复杂度证据不足" }],
  };
}

describe("computeSyntheticEvalMetrics", () => {
  it("computes success, expectation coverage and repeat stability", () => {
    const runs: SyntheticRunRecord[] = [
      {
        caseId: CASE.id,
        review: review({
          baseScore: 80,
          experienceScore: 70,
          skillRationale: "React 项目证据充分",
          skillScore: 80,
        }),
        runIndex: 1,
        status: "success",
      },
      {
        caseId: CASE.id,
        review: review({
          action: "hold",
          baseScore: 86,
          experienceScore: 74,
          skillRationale: "TypeScript 使用经历明确",
          skillScore: 90,
        }),
        runIndex: 2,
        status: "success",
      },
      { caseId: CASE.id, error: "model unavailable", runIndex: 3, status: "failed" },
    ];

    const metrics = computeSyntheticEvalMetrics([CASE], runs);

    expect(metrics).toMatchObject({
      actionAgreementRate: 0.5,
      allowedActionRate: 1,
      baseScoreSpreadMax: 6,
      dimensionBandPassRate: 1,
      maxDimensionScoreSpread: 10,
      rationaleTermCoverage: 1,
      successRate: 2 / 3,
    });
    expect(metrics.perCase[0]).toMatchObject({
      actionAgreementRate: 0.5,
      baseScoreSpread: 6,
      failedRuns: 1,
      successfulRuns: 2,
    });
  });

  it("counts disallowed actions and out-of-band dimensions", () => {
    const metrics = computeSyntheticEvalMetrics(
      [CASE],
      [
        {
          caseId: CASE.id,
          review: review({
            action: "reject",
            baseScore: 50,
            experienceScore: 40,
            skillRationale: "没有岗位证据",
            skillScore: 40,
          }),
          runIndex: 1,
          status: "success",
        },
      ],
    );

    expect(metrics.allowedActionRate).toBe(0);
    expect(metrics.dimensionBandPassRate).toBe(0);
    expect(metrics.rationaleTermCoverage).toBe(0);
  });

  it("requires at least three runs per case in strict mode", () => {
    const metrics = computeSyntheticEvalMetrics(
      [CASE],
      [
        {
          caseId: CASE.id,
          review: review({
            baseScore: 80,
            experienceScore: 70,
            skillRationale: "React 项目证据充分",
            skillScore: 80,
          }),
          runIndex: 1,
          status: "success",
        },
      ],
    );

    expect(getSyntheticEvalStrictFailures(metrics, 1)).toContain(
      "strict 模式每个案例至少需要运行 3 次",
    );
  });

  it("marks absent band and rationale checks as not applicable", () => {
    const noScoreExpectationCase: SyntheticResumeReviewCase = {
      ...CASE,
      expectations: {
        allowedActions: ["hold", "reject"],
        dimensionBands: {},
        rationaleTerms: {},
      },
      id: "blocking-only",
    };
    const metrics = computeSyntheticEvalMetrics(
      [noScoreExpectationCase],
      [
        {
          caseId: noScoreExpectationCase.id,
          review: review({
            action: "hold",
            baseScore: 50,
            experienceScore: 50,
            skillRationale: "由硬门槛约束暂缓",
            skillScore: 50,
          }),
          runIndex: 1,
          status: "success",
        },
      ],
    );

    expect(metrics.dimensionBandPassRate).toBeNull();
    expect(metrics.rationaleTermCoverage).toBeNull();
    expect(getSyntheticEvalStrictFailures(metrics, 3)).not.toContain("维度区间命中率低于 90%");
    expect(getSyntheticEvalStrictFailures(metrics, 3)).not.toContain("理由证据覆盖率低于 80%");
    expect(
      getSyntheticEvalStrictFailures({ ...metrics, maxDimensionScoreSpread: 99 }, 3),
    ).not.toContain("六维最大波动超过 15");
  });
});
