import { describe, expect, it, vi } from "vitest";
import {
  buildQualitativeResumeEvaluationPrompt,
  generateQualitativeResumeEvaluation,
} from "./qualitative-resume-evaluation";
import type { ResumeProfile } from "@arc/db-schema/interview/types";

const profile = {
  age: null,
  educationExperiences: [],
  email: null,
  gender: null,
  name: "候选人",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: [],
  targetRoles: [],
  workExperiences: [],
  workYears: null,
} satisfies ResumeProfile;

const output = {
  conciseOverall:
    "候选人的企业软件产品经验与岗位核心要求相符，跨团队交付事实充分，建议进入下一轮。",
  detailedOverall: {
    judgment: "整体匹配，建议进入下一轮。",
    matchingEvidence: "候选人连续负责企业软件产品，并有跨团队交付经历。",
    risks: "简历未说明招聘行业经验，需在面试中确认迁移能力。",
  },
  dimensions: Object.fromEntries(
    [
      "educationBackground",
      "experienceRelevance",
      "potential",
      "projectMatch",
      "skillMatch",
      "stability",
    ].map((key) => [
      key,
      { basis: "both", evaluation: "简历事实与岗位要求基本一致，仍有少量信息需要面试确认。" },
    ]),
  ),
  recommendationLevel: "recommended",
  schemaVersion: 1,
  seniorityRecommendation: null,
  teamPositioning: null,
};

describe("qualitative resume evaluation prompt", () => {
  it("encodes the qualitative guardrails and only receives the JD snapshot", () => {
    const prompt = buildQualitativeResumeEvaluationPrompt({
      evaluationAsOf: "2026-08-25",
      jobDescriptionName: "产品经理",
      jobDescriptionPrompt: "负责企业级招聘产品。",
      resumeProfile: profile,
      resumeText: "曾负责企业软件产品。",
    });

    expect(prompt).toContain("不推荐、待定、推荐、非常推荐");
    expect(prompt).toContain("岗位 JD 未提出要求");
    expect(prompt).toContain("普适职业标准");
    expect(prompt).toContain("普适职业标准不能单独导致“不推荐”");
    expect(prompt).toContain("简历事实");
    expect(prompt).not.toContain("硬性门槛");
    expect(prompt).not.toContain("优先条件");
  });

  it("validates the model output with the qualitative contract", async () => {
    const generate = vi.fn().mockResolvedValue(output);
    await expect(
      generateQualitativeResumeEvaluation(
        {
          evaluationAsOf: "2026-08-25",
          jobDescriptionName: "产品经理",
          jobDescriptionPrompt: "负责企业级招聘产品。",
          resumeProfile: profile,
          resumeText: "曾负责企业软件产品。",
        },
        generate,
      ),
    ).resolves.toMatchObject({ recommendationLevel: "recommended" });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 8192, temperature: 0 }),
    );
  });
});
