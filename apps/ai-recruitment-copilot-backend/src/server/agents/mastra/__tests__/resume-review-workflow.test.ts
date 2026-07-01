import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";

const mocks = vi.hoisted(() => ({
  buildRejectReview: vi.fn(),
  composeReview: vi.fn(),
  generateQualitativeReview: vi.fn(),
  generateScoring: vi.fn(),
  runHardFilter: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent", () => ({
  buildHardFilterRejectReview: mocks.buildRejectReview,
  composeResumeReviewResult: mocks.composeReview,
  generateResumeQualitativeReview: mocks.generateQualitativeReview,
  generateResumeReviewScoring: mocks.generateScoring,
  runResumeReviewHardFilter: mocks.runHardFilter,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for correct hoisting
import { runResumeReviewWorkflow } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/resume-review-workflow";

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

  it("runs hard filter, qualitative review, scoring, and composition", async () => {
    const qualitative = { overall: { conclusion: "匹配" } };
    const scoring = { dimensions: {} };
    const composed = {
      review: "候选人与岗位匹配。",
      structuredReview: { overall: { baseScore: 88 } },
    };

    mocks.runHardFilter.mockResolvedValue(null);
    mocks.generateQualitativeReview.mockResolvedValue(qualitative);
    mocks.generateScoring.mockResolvedValue(scoring);
    mocks.composeReview.mockReturnValue(composed);

    const result = await runResumeReviewWorkflow({
      jobDescription: "岗位名称：前端工程师",
      resumeProfile: PROFILE,
    });

    expect(result).toEqual(composed);
    expect(mocks.runHardFilter).toHaveBeenCalledWith(PROFILE, "岗位名称：前端工程师");
    expect(mocks.generateQualitativeReview).toHaveBeenCalledWith({
      jobDescription: "岗位名称：前端工程师",
      resumeProfile: PROFILE,
      semanticRequirements: null,
    });
    expect(mocks.generateScoring).toHaveBeenCalledWith({
      jobDescription: "岗位名称：前端工程师",
      qualitative,
      resumeProfile: PROFILE,
    });
    expect(mocks.composeReview).toHaveBeenCalledWith(qualitative, scoring);
  });
});
