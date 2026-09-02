import { describe, expect, it, vi } from "vitest";
import {
  buildQualitativeResumeEvaluationPrompt,
  generateQualitativeResumeEvaluation,
  normalizeGeneratedQualitativeResumeEvaluation,
} from "./qualitative-resume-evaluation";
import { qualitativeResumeEvaluationV2Schema } from "@app/db-schema/qualitative-resume-evaluation";
import type { ResumeProfile } from "@app/db-schema/interview/types";

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
    judgment:
      "候选人整体与企业级招聘产品经理岗位较为匹配，建议进入下一轮。其在上一段经历中连续三年负责企业软件产品，从需求调研、方案设计到跨团队交付均有完整实践，并推动招聘流程模块按期上线；这些经历直接支持岗位对B端产品规划、复杂流程抽象和项目协同的要求。候选人还熟悉用户访谈、数据分析与迭代验证，能够结合客户反馈持续优化方案。不过，简历尚未体现招聘行业的长期积累，也缺少大型客户商业化结果和团队管理规模等信息，因此当前判断以已有项目证据为主，相关能力仍需在面试中进一步确认。",
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
      {
        basis: "both",
        evaluation: "简历事实与岗位要求基本一致，仍有少量信息需要面试确认。",
        level: "recommended",
      },
    ]),
  ),
  recommendationLevel: "recommended",
  schemaVersion: 2,
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
    expect(prompt).toContain("dimensions.*.level");
    expect(prompt).toContain("不得机械复制综合等级");
    expect(prompt).toContain("岗位 JD 未提出要求");
    expect(prompt).toContain("普适职业标准");
    expect(prompt).toContain("普适职业标准不能单独导致“不推荐”");
    expect(prompt).toContain("简历事实");
    expect(prompt).toContain("200–300 个中文字符");
    expect(prompt).toContain("具体经历、项目、职责、技能或量化成果");
    expect(prompt).toContain("如何支持综合判断");
    expect(prompt).toContain("受限 Markdown");
    expect(prompt).toContain("粗体、斜体和有序列表");
    expect(prompt).toContain("列点时只允许使用有序列表");
    expect(prompt).toContain("不得使用 Markdown 标题");
    expect(prompt).toContain("risks 有多个风险点时必须使用有序列表");
    expect(prompt).toContain("每个列表项必须独占一行");
    expect(prompt).toContain("1. 第一项\n2. 第二项\n3. 第三项\n4. 第四项");
    expect(prompt).toContain("不得使用无序列表");
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
    ).resolves.toMatchObject({ recommendationLevel: "recommended", schemaVersion: 2 });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 8192,
        normalizeInvalid: normalizeGeneratedQualitativeResumeEvaluation,
        observabilityLabel: "qualitative-resume-v7",
        temperature: 0,
      }),
    );
    const request = generate.mock.calls[0]?.[0];
    const { schemaVersion: _schemaVersion, ...generatedOutput } = output;
    expect(request?.schema.safeParse(generatedOutput).success).toBe(true);
    expect(request?.schema.safeParse(output).success).toBe(false);
  });

  it("removes model-owned metadata and canonicalizes missing optional guidance", () => {
    const { seniorityRecommendation: _seniority, teamPositioning: _positioning, ...rest } = output;
    const normalized = normalizeGeneratedQualitativeResumeEvaluation({
      ...rest,
      schemaVersion: "qualitative-v2",
    });

    expect(normalized).not.toHaveProperty("schemaVersion");
    expect(normalized).toMatchObject({
      seniorityRecommendation: null,
      teamPositioning: null,
    });
  });

  it("drops malformed optional guidance instead of rejecting the core evaluation", () => {
    const normalized = normalizeGeneratedQualitativeResumeEvaluation({
      ...output,
      schemaVersion: null,
      seniorityRecommendation: undefined,
      teamPositioning: {
        position: "业务线负责人",
        rationale: "候选人有跨团队协作经历。",
      },
    });

    expect(normalized).not.toHaveProperty("schemaVersion");
    expect(normalized).toMatchObject({
      seniorityRecommendation: null,
      teamPositioning: null,
    });
  });

  it("keeps incomplete core evaluation fields invalid", () => {
    const normalized = normalizeGeneratedQualitativeResumeEvaluation({
      ...output,
      dimensions: {
        ...output.dimensions,
        stability: {
          ...output.dimensions.stability,
          evaluation: null,
        },
      },
    });

    expect(
      qualitativeResumeEvaluationV2Schema.omit({ schemaVersion: true }).safeParse(normalized)
        .success,
    ).toBe(false);
  });
});
