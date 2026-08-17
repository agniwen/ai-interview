import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  createResumeReviewWorkflow,
  runResumeReviewWorkflow,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/resume-review-workflow";

const mocks = {
  composeReview: vi.fn(),
  generateQualitativeReview: vi.fn(),
  generateScoring: vi.fn(),
};

const workflow = createResumeReviewWorkflow(mocks);

const PROFILE: ResumeProfile = {
  age: null,
  educationExperiences: [],
  email: "candidate@example.com",
  gender: null,
  name: "候选人",
  personalStrengths: ["工程化"],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: ["TypeScript", "React"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 5,
};

describe("runResumeReviewWorkflow", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
  });

  it("runs qualitative review, scoring, and composition", async () => {
    const reviewPoint = { evidence: null, impact: "支持岗位匹配", point: "工程化经验" };
    const dimension = { rationale: "符合岗位要求", score: 88 };
    const qualitative = {
      biasScan: { items: [] },
      levelRecommendation: { level: "高级", rationale: "经验匹配" },
      nextStep: {
        action: "interview" as const,
        disclaimer: "以上为初步结论" as const,
        interviewFocus: [],
        rationale: "建议进一步面试",
      },
      overall: { conclusion: "匹配" },
      strengths: [reviewPoint],
      teamPositioning: { rationale: "技能匹配", suggestion: "前端工程" },
      weaknesses: [{ evidence: null, impact: "需要核实", point: "项目细节不足" }],
    };
    const scoring = {
      dimensions: {
        educationBackground: dimension,
        experienceRelevance: dimension,
        potential: dimension,
        projectMatch: dimension,
        skillMatch: dimension,
        stability: dimension,
      },
    };
    const composed = {
      review: "候选人与岗位匹配。",
      structuredReview: {
        ...qualitative,
        dimensions: scoring.dimensions,
        overall: { baseScore: 88, conclusion: "匹配", scoreRationale: "六维得分稳定" },
        schemaVersion: 4 as const,
      },
    };

    mocks.generateQualitativeReview.mockResolvedValue(qualitative);
    mocks.generateScoring.mockResolvedValue(scoring);
    mocks.composeReview.mockReturnValue(composed);

    const screeningResult = {
      policyEmpty: false,
      policyEnabled: true,
      policyHash: "hash",
      policyVersion: 1,
      recommendation: "hold" as const,
      ruleResults: [],
    };
    const result = await runResumeReviewWorkflow(
      {
        jobDescription: "岗位名称：前端工程师",
        resumeProfile: PROFILE,
        screeningResult,
      },
      workflow,
    );

    expect(result).toEqual(composed);
    expect(mocks.generateQualitativeReview).toHaveBeenCalledWith({
      jobDescription: "岗位名称：前端工程师",
      resumeProfile: PROFILE,
      screeningResult,
    });
    expect(mocks.generateScoring).toHaveBeenCalledWith({
      jobDescription: "岗位名称：前端工程师",
      qualitative,
      resumeProfile: PROFILE,
      screeningResult,
    });
    expect(mocks.composeReview).toHaveBeenCalledWith(qualitative, scoring, {
      screeningResult,
    });
  });
});
