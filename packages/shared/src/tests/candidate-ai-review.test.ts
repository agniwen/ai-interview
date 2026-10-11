import { describe, expect, it } from "vitest";
import type { ResumeReviewLoose } from "../resume-review";
import { buildCandidateAiReview } from "../interview/interview-record";

const review: ResumeReviewLoose = {
  biasScan: { items: [] },
  dimensions: {
    potential: { rationale: "学习能力较强", score: 82 },
    skillMatch: { rationale: "技能覆盖岗位要求", score: 88 },
  },
  levelRecommendation: { level: "中高级", rationale: "经验匹配" },
  nextStep: {
    action: "interview",
    disclaimer: "以上为初步结论",
    interviewFocus: [],
    rationale: "建议进入面试",
  },
  overall: {
    baseScore: 85,
    conclusion: "候选人的核心经验与岗位需求较为匹配。",
    scoreRationale: "基于简历与岗位要求综合判断。",
  },
  schemaVersion: 4,
  strengths: [
    {
      evidence: "负责过相关产品",
      impact: "可以较快进入工作状态",
      point: "具备完整的产品经验",
    },
  ],
  teamPositioning: { rationale: "能力互补", suggestion: "产品负责人" },
  weaknesses: [
    {
      evidence: "简历未提及",
      impact: "需要在面试中确认",
      point: "行业经验仍待核实",
    },
  ],
};

describe("buildCandidateAiReview", () => {
  it("只投影候选人准备页需要的评价字段", () => {
    expect(buildCandidateAiReview(review)).toEqual({
      baseScore: 85,
      conclusion: "候选人的核心经验与岗位需求较为匹配。",
      dimensions: [
        {
          key: "skillMatch",
          label: "技能匹配度",
          rationale: "技能覆盖岗位要求",
          score: 88,
        },
        { key: "potential", label: "潜力评估", rationale: "学习能力较强", score: 82 },
      ],
      strengths: [
        {
          evidence: "负责过相关产品",
          impact: "可以较快进入工作状态",
          point: "具备完整的产品经验",
        },
      ],
    });
  });

  it("没有评价时返回 null", () => {
    expect(buildCandidateAiReview(null)).toBeNull();
  });
});
