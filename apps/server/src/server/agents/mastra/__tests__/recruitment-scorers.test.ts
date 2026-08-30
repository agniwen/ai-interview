import { describe, expect, it } from "vitest";
import {
  interviewQuestionCountScorer,
  jdMatchEvidenceScorer,
  recruitmentScorers,
  reportEvidenceGroundingScorer,
  resumeProfileCompletenessScorer,
  resumeReviewStructureScorer,
} from "@app/server/server/agents/mastra/scorers/recruitment-scorers";

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
      "jdMatchEvidenceScorer",
      "reportEvidenceGroundingScorer",
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

  it("scores JD match evidence against the selected job and resume terms", async () => {
    const input = {
      jobDescriptions: [
        {
          departmentName: "研发部",
          description: "负责 React 与 TypeScript 前端工程建设。",
          id: "jd-frontend",
          name: "前端工程师",
        },
        {
          departmentName: "销售部",
          description: "负责客户拓展和商务跟进。",
          id: "jd-sales",
          name: "销售顾问",
        },
      ],
      resumeProfile: COMPLETE_PROFILE,
    };
    const grounded = await jdMatchEvidenceScorer.run({
      input,
      output: {
        jobDescriptionId: "jd-frontend",
        reason: "候选人目标岗位是前端工程师，React 和 TypeScript 经验与岗位要求匹配。",
      },
    });
    const weak = await jdMatchEvidenceScorer.run({
      input,
      output: {
        jobDescriptionId: "jd-frontend",
        reason: "默认选择这个岗位。",
      },
    });

    expect(grounded.score).toBe(1);
    expect(weak.score).toBeLessThan(grounded.score);
  });

  it("scores interview report evidence against candidate transcript quotes", async () => {
    const grounded = await reportEvidenceGroundingScorer.run({
      input: {
        transcript: [
          { message: "请介绍项目。", role: "agent" },
          { message: "我负责招聘系统前端，也处理了性能优化。", role: "user" },
        ],
      },
      output: {
        evaluation: {
          questions: [
            {
              evidence: [{ quote: "我负责招聘系统前端" }],
            },
          ],
        },
        summary: "候选人介绍了项目经历。",
      },
    });
    const ungrounded = await reportEvidenceGroundingScorer.run({
      input: {
        transcript: [
          { message: "请介绍项目。", role: "agent" },
          { message: "我负责招聘系统前端，也处理了性能优化。", role: "user" },
        ],
      },
      output: {
        evaluation: {
          questions: [
            {
              evidence: [{ quote: "我负责后端支付系统" }],
            },
          ],
        },
        summary: "候选人介绍了项目经历。",
      },
    });

    expect(grounded.score).toBe(1);
    expect(ungrounded.score).toBe(0);
  });
});
