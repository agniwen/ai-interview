import { describe, expect, it } from "vitest";
import {
  interviewQuestionCountScorer,
  recruitmentScorers,
  resumeProfileCompletenessScorer,
  resumeReviewStructureScorer,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/scorers/recruitment-scorers";

const COMPLETE_PROFILE = {
  age: 29,
  educationExperiences: [],
  email: "candidate@example.com",
  gender: null,
  name: "候选人",
  personalStrengths: ["沟通清晰"],
  phone: "13800000000",
  projectExperiences: [],
  schools: ["浙江大学"],
  skills: ["TypeScript", "React"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 6,
};

describe("recruitment Mastra scorers", () => {
  it("exports stable scorer registrations", () => {
    expect(Object.keys(recruitmentScorers).toSorted()).toEqual([
      "interviewQuestionCountScorer",
      "resumeProfileCompletenessScorer",
      "resumeReviewStructureScorer",
    ]);
  });

  it("scores resume profile completeness", async () => {
    const full = await resumeProfileCompletenessScorer.run({
      output: { resumeProfile: COMPLETE_PROFILE },
    });
    const sparse = await resumeProfileCompletenessScorer.run({
      output: {
        resumeProfile: {
          ...COMPLETE_PROFILE,
          email: null,
          name: "未发现信息",
          phone: null,
          schools: [],
          skills: [],
          targetRoles: [],
          workYears: null,
        },
      },
    });

    expect(full.score).toBe(1);
    expect(sparse.score).toBeLessThan(full.score);
  });

  it("scores question count against the product expectation of 10 questions", async () => {
    const result = await interviewQuestionCountScorer.run({
      output: {
        interviewQuestions: Array.from({ length: 8 }, (_, index) => ({
          difficulty: "medium",
          order: index + 1,
          question: `问题 ${index + 1}`,
        })),
      },
    });

    expect(result.score).toBe(0.8);
  });

  it("scores review structure when both text and structured review exist", async () => {
    const result = await resumeReviewStructureScorer.run({
      output: {
        review: "候选人与岗位匹配度较高。",
        structuredReview: { overall: { baseScore: 82 } },
      },
    });

    expect(result.score).toBe(1);
  });
});
